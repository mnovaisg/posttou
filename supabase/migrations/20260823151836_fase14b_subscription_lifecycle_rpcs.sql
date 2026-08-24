alter table public.subscriptions
  add column pending_change_kind text check (pending_change_kind in ('upgrade','downgrade')),
  add column pending_change_price_cents bigint;

create table public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  asaas_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);
alter table public.asaas_webhook_events enable row level security;
-- Sem policy alguma: só service_role (webhook) e superuser leem/escrevem.

create or replace function public.create_workspace_in_organization(p_organization_id uuid, p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan public.plans;
  v_sub public.subscriptions;
  v_current_count integer;
  v_slug_base text;
  v_slug text;
  v_workspace public.workspaces;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CREATE_WORKSPACE';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id;
  if v_sub is null or public.get_effective_subscription_status(v_sub) in ('expired','cancelled') then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  select count(*) into v_current_count from public.workspaces where organization_id = p_organization_id;

  if v_current_count >= v_plan.max_workspaces then
    raise exception 'MAX_WORKSPACES_REACHED';
  end if;

  v_slug_base := public.slugify_base(p_name);
  v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.workspaces (name, slug, owner_id, organization_id)
  values (p_name, v_slug, auth.uid(), p_organization_id)
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, auth.uid(), 'owner');

  insert into public.credit_accounts (workspace_id, balance) values (v_workspace.id, 0);

  perform public.log_audit_event(v_workspace.id, 'workspace_created_in_organization', 'workspace', v_workspace.id, jsonb_build_object('organization_id', p_organization_id));

  return v_workspace;
end;
$$;

grant execute on function public.create_workspace_in_organization(uuid, text) to authenticated;

create or replace function public.request_plan_change(p_organization_id uuid, p_new_plan_id text, p_new_billing_interval public.billing_interval)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
  v_current_plan public.plans;
  v_new_plan public.plans;
  v_current_price bigint;
  v_new_price bigint;
  v_kind text;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then raise exception 'NO_SUBSCRIPTION_FOUND'; end if;

  select * into v_new_plan from public.plans where id = p_new_plan_id and is_active;
  if v_new_plan is null then raise exception 'INVALID_PLAN'; end if;

  select * into v_current_plan from public.plans where id = v_sub.plan_id;
  v_current_price := case when v_sub.billing_interval = 'monthly' then v_current_plan.price_monthly_cents else v_current_plan.price_yearly_cents end;
  v_new_price := case when p_new_billing_interval = 'monthly' then v_new_plan.price_monthly_cents else v_new_plan.price_yearly_cents end;

  v_kind := case when v_new_price > v_current_price then 'upgrade' else 'downgrade' end;

  if v_kind = 'downgrade' then
    -- Downgrade: só entra em vigor no próximo ciclo, sem cobrança nova
    -- agora. Nunca apaga workspaces/membros/conteúdo excedente.
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'downgrade', pending_change_price_cents = v_new_price, updated_at = now()
    where organization_id = p_organization_id;
  else
    -- Upgrade: entitlements só liberam após cobrança confirmada (decisão
    -- explícita da Fase 14B — sem "libera agora, cobra depois"). O valor
    -- efetivamente cobrado é decidido pela Edge Function que fala com o
    -- Asaas; aqui só registramos a intenção.
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'upgrade', pending_change_price_cents = v_new_price, updated_at = now()
    where organization_id = p_organization_id;
  end if;

  return jsonb_build_object('kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_new_price);
end;
$$;

grant execute on function public.request_plan_change(uuid, text, public.billing_interval) to authenticated;

create or replace function public.apply_confirmed_plan_change_system(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null or v_sub.pending_plan_id is null then
    raise exception 'NO_PENDING_PLAN_CHANGE';
  end if;

  update public.subscriptions
  set plan_id = pending_plan_id, billing_interval = coalesce(pending_billing_interval, billing_interval),
      pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null, pending_change_price_cents = null,
      updated_at = now()
  where organization_id = p_organization_id
  returning * into v_sub;

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (p_organization_id, v_sub.status, v_sub.status, 'plan_changed_to_' || v_sub.plan_id);

  return v_sub;
end;
$$;

grant execute on function public.apply_confirmed_plan_change_system(uuid) to service_role;

create or replace function public.apply_scheduled_downgrades_system()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
begin
  with due as (
    select organization_id from public.subscriptions
    where pending_change_kind = 'downgrade'
      and current_period_end is not null and current_period_end <= now()
  )
  update public.subscriptions s
  set plan_id = s.pending_plan_id, billing_interval = coalesce(s.pending_billing_interval, s.billing_interval),
      pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null, pending_change_price_cents = null,
      updated_at = now()
  from due where s.organization_id = due.organization_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.apply_scheduled_downgrades_system() to service_role;

create or replace function public.schedule_subscription_cancellation(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CANCEL';
  end if;

  update public.subscriptions
  set status = 'cancel_at_period_end', cancel_at_period_end = true, updated_at = now()
  where organization_id = p_organization_id and status in ('active','past_due')
  returning * into v_sub;

  if v_sub is null then raise exception 'SUBSCRIPTION_NOT_CANCELLABLE_FROM_CURRENT_STATE'; end if;

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (p_organization_id, 'active', 'cancel_at_period_end', 'user_requested');

  return v_sub;
end;
$$;

grant execute on function public.schedule_subscription_cancellation(uuid) to authenticated;

create or replace function public.undo_subscription_cancellation(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_UNDO_CANCEL';
  end if;

  update public.subscriptions
  set status = 'active', cancel_at_period_end = false, updated_at = now()
  where organization_id = p_organization_id and status = 'cancel_at_period_end'
    and current_period_end > now()
  returning * into v_sub;

  if v_sub is null then raise exception 'NOTHING_TO_UNDO'; end if;
  return v_sub;
end;
$$;

grant execute on function public.undo_subscription_cancellation(uuid) to authenticated;
