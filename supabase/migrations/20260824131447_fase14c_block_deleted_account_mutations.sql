-- Fase 14C, ajuste final — profiles.deleted_at bloqueia o PRÓXIMO login,
-- mas um access token já emitido continua válido por até ~1h (limitação
-- documentada). Fecha o gap no lado do servidor: centraliza a checagem
-- nos 4 primitivos de autorização que praticamente toda RPC/policy RLS
-- do produto já usa — nenhuma RPC individual precisa mudar.
--
-- auth.uid() is null é o caminho de chamadas service_role (crons,
-- workers) — nunca bloqueado por esta checagem, que é só sobre a CONTA
-- HUMANA logada.
create or replace function public.is_current_account_active()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and deleted_at is not null
  );
$$;

revoke execute on function public.is_current_account_active() from public, anon;
grant execute on function public.is_current_account_active() to authenticated, service_role;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_current_account_active() and exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles workspace_role[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_current_account_active() and exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = any (p_roles)
  );
$$;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_current_account_active() and exists (
    select 1 from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.organization_id = p_organization_id and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_current_account_active() and exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.owner_user_id = auth.uid()
  );
$$;

-- Defesa em profundidade: o gate de conteúdo/franquia e o de assinatura
-- (operação paga) checam diretamente também, sem depender só dos 4
-- primitivos acima — cobre os casos que não passam por eles.
create or replace function public.check_subscription_entitlement(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_sub public.subscriptions;
  v_effective_status public.subscription_status;
begin
  if not public.is_current_account_active() then
    return jsonb_build_object('allowed', false, 'reason', 'ACCOUNT_DELETED');
  end if;

  select organization_id into v_org_id from public.workspaces where id = p_workspace_id;
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'WORKSPACE_WITHOUT_ORGANIZATION');
  end if;

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIPTION_FOUND');
  end if;

  v_effective_status := public.get_effective_subscription_status(v_sub);

  if v_effective_status in ('expired', 'cancelled') then
    return jsonb_build_object('allowed', false, 'reason', 'SUBSCRIPTION_' || upper(v_effective_status::text), 'status', v_effective_status);
  end if;

  return jsonb_build_object('allowed', true, 'status', v_effective_status);
end;
$$;

create or replace function public.enforce_content_franchise_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_effective_status public.subscription_status;
  v_period record;
  v_used integer;
begin
  if not public.is_current_account_active() then
    raise exception 'ACCOUNT_DELETED';
  end if;

  select organization_id into v_org_id from public.workspaces where id = new.workspace_id;
  if v_org_id is null then
    raise exception 'WORKSPACE_WITHOUT_ORGANIZATION';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_org_id::text));

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    raise exception 'NO_SUBSCRIPTION_FOUND';
  end if;

  v_effective_status := public.get_effective_subscription_status(v_sub);

  if v_effective_status in ('expired', 'cancelled') then
    raise exception 'SUBSCRIPTION_%', upper(v_effective_status::text);
  end if;

  if v_effective_status <> 'trialing' then
    select * into v_plan from public.plans where id = v_sub.plan_id;
    select * into v_period from public.get_franchise_period(v_sub);

    select count(*) into v_used from public.content_franchise_ledger
    where organization_id = v_org_id and period_start = v_period.period_start;

    if v_used >= v_plan.monthly_content_allowance then
      raise exception 'FRANCHISE_LIMIT_REACHED';
    end if;

    insert into public.content_franchise_ledger (organization_id, workspace_id, content_id, period_start, period_end)
    values (v_org_id, new.workspace_id, new.id, v_period.period_start, v_period.period_end)
    on conflict (content_id) do nothing;
  end if;

  return new;
end;
$$;
