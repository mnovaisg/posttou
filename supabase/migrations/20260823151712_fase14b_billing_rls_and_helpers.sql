alter table public.organizations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.plans enable row level security;
alter table public.content_franchise_ledger enable row level security;
alter table public.subscription_status_history enable row level security;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
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
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.owner_user_id = auth.uid()
  );
$$;

create policy plans_select_all on public.plans for select to authenticated using (is_active);

create policy organizations_select_members on public.organizations for select to authenticated
  using (public.is_organization_member(id));

create policy subscriptions_select_members on public.subscriptions for select to authenticated
  using (public.is_organization_member(organization_id));

create policy content_franchise_ledger_select_members on public.content_franchise_ledger for select to authenticated
  using (public.is_organization_member(organization_id));

create policy subscription_status_history_select_members on public.subscription_status_history for select to authenticated
  using (public.is_organization_member(organization_id));

-- Nenhuma policy de insert/update/delete para authenticated nestas tabelas:
-- toda escrita passa exclusivamente por RPCs security definer (subscriptions
-- só muda de estado via lógica de servidor validada contra o Asaas/admin,
-- nunca por escrita direta do cliente).

create or replace function public.get_effective_subscription_status(p_sub public.subscriptions)
returns public.subscription_status
language sql
stable
as $$
  select case
    when p_sub.status = 'trialing' and p_sub.trial_ends_at is not null and p_sub.trial_ends_at < now()
      then 'expired'::public.subscription_status
    when p_sub.status = 'past_due' and p_sub.past_due_since is not null
      and now() > p_sub.past_due_since + make_interval(days => p_sub.past_due_grace_days)
      then 'expired'::public.subscription_status
    when p_sub.status = 'cancel_at_period_end' and p_sub.current_period_end is not null and p_sub.current_period_end < now()
      then 'cancelled'::public.subscription_status
    else p_sub.status
  end;
$$;

create or replace function public.get_franchise_period(p_sub public.subscriptions, p_now timestamptz default now())
returns table(period_start date, period_end date)
language plpgsql
stable
as $$
declare
  v_anchor timestamptz;
  v_months_elapsed integer;
  v_start timestamptz;
begin
  v_anchor := coalesce(p_sub.activated_at, p_sub.trial_ends_at - interval '3 days', p_sub.created_at);
  v_months_elapsed := extract(year from age(p_now, v_anchor))::integer * 12 + extract(month from age(p_now, v_anchor))::integer;
  v_start := v_anchor + make_interval(months => greatest(v_months_elapsed, 0));
  return query select v_start::date, (v_start + interval '1 month')::date;
end;
$$;

create or replace function public.get_workspace_entitlements(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
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
  select organization_id into v_org_id from public.workspaces where id = p_workspace_id;
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'WORKSPACE_WITHOUT_ORGANIZATION');
  end if;

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIPTION_FOUND');
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  v_effective_status := public.get_effective_subscription_status(v_sub);
  select * into v_period from public.get_franchise_period(v_sub);

  select count(*) into v_used from public.content_franchise_ledger
  where organization_id = v_org_id and period_start = v_period.period_start;

  return jsonb_build_object(
    'allowed', v_effective_status not in ('expired','cancelled'),
    'status', v_effective_status,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'billing_interval', v_sub.billing_interval,
    'monthly_content_allowance', v_plan.monthly_content_allowance,
    'content_used_this_period', case when v_effective_status = 'trialing' then null else v_used end,
    'content_remaining_this_period', case when v_effective_status = 'trialing' then null else greatest(v_plan.monthly_content_allowance - v_used, 0) end,
    'franchise_period_start', v_period.period_start,
    'franchise_period_end', v_period.period_end,
    'max_workspaces', v_plan.max_workspaces,
    'max_members', v_plan.max_members,
    'trial_ends_at', v_sub.trial_ends_at,
    'capabilities', v_plan.capabilities
  );
end;
$$;

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

grant execute on function public.get_workspace_entitlements(uuid) to authenticated, service_role;
grant execute on function public.check_subscription_entitlement(uuid) to authenticated, service_role;
