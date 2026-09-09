-- Bloco: Assinatura Interna/Cortesia — exclusão explícita de organizações
-- marcadas como internas (subscriptions.metadata->>'internal'='true') de
-- TODAS as populações comerciais/financeiras. Nenhuma fórmula já aprovada
-- foi alterada — só um filtro adicional (not _is_internal_subscription(s))
-- nas mesmas populações que já existiam. Cobre os 7 pontos encontrados na
-- auditoria de todos os RPCs que leem a tabela subscriptions:
--   1. _admin_projected_charges — alimenta admin_financial_summary_system
--      (projected_cents) e admin_revenue_projection_system; sem esse
--      filtro, uma assinatura interna sem current_period_end projetaria
--      uma cobrança falsa "hoje" usando o preço do plano.
--   2. admin_recurring_revenue_system — MRR/ARR/clientes pagantes.
--   3. admin_revenue_by_plan_system — MRR por plano.
--   4. admin_revenue_lost_system — MRR cancelado no período / em risco.
--   5. admin_upcoming_receivables_system — próximos recebimentos projetados.
--   6. admin_lead_metrics_system — funil comercial, conversão Trial→Pago,
--      distribuição de status, MRR do CRM.
--   7. admin_executive_dashboard_system — funil comercial/ativação do
--      produto (cálculo próprio, não reaproveita admin_lead_metrics_system
--      pra isso), novos clientes pagos no mês, novos cadastros no mês,
--      trials vencendo em 48h.

-- 1. _admin_projected_charges
create or replace function public._admin_projected_charges(p_start date, p_end date)
returns table(charge_month date, organization_id uuid, amount_cents bigint)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  r record;
  v_plan_id text;
  v_interval billing_interval;
  v_amount bigint;
  v_next date;
  v_switch_done boolean;
  v_switch_date date;
begin
  for r in
    select s.organization_id, s.plan_id, s.billing_interval, s.current_period_end,
           s.pending_change_kind, s.pending_plan_id, s.pending_billing_interval, s.pending_change_price_cents
    from public.subscriptions s
    where s.status in ('active', 'past_due') and s.cancel_at_period_end = false
      and not public._is_internal_subscription(s)
  loop
    v_plan_id := r.plan_id;
    v_interval := r.billing_interval;
    v_amount := public._admin_org_contracted_cents(v_plan_id, v_interval, r.organization_id);
    v_next := coalesce(r.current_period_end::date, current_date);
    v_switch_date := r.current_period_end::date;
    v_switch_done := coalesce(r.pending_change_kind, '') not in ('cycle_change', 'downgrade');

    while v_next <= p_end loop
      if not v_switch_done and v_next >= v_switch_date then
        v_plan_id := r.pending_plan_id;
        v_interval := r.pending_billing_interval;
        v_amount := r.pending_change_price_cents;
        v_switch_done := true;
      end if;

      if v_next >= p_start then
        charge_month := date_trunc('month', v_next)::date;
        organization_id := r.organization_id;
        amount_cents := v_amount;
        return next;
      end if;

      if v_interval = 'monthly' then
        v_next := (v_next + interval '1 month')::date;
      else
        v_next := (v_next + interval '1 year')::date;
      end if;
    end loop;
  end loop;
end;
$function$;

-- 2. admin_recurring_revenue_system
create or replace function public.admin_recurring_revenue_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mrr_cents bigint := 0;
  v_paying_customers int := 0;
  r record;
begin
  perform public._require_platform_admin();

  for r in
    select s.organization_id, s.plan_id, s.billing_interval
    from public.subscriptions s
    where public.get_effective_subscription_status(s) in ('active', 'past_due', 'cancel_at_period_end')
      and not public._is_internal_subscription(s)
  loop
    v_mrr_cents := v_mrr_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
    v_paying_customers := v_paying_customers + 1;
  end loop;

  return jsonb_build_object(
    'mrr_cents', v_mrr_cents,
    'arr_cents', v_mrr_cents * 12,
    'paying_customers', v_paying_customers,
    'average_ticket_cents', case when v_paying_customers > 0 then round(v_mrr_cents::numeric / v_paying_customers) else 0 end
  );
end;
$function$;

-- 3. admin_revenue_by_plan_system
create or replace function public.admin_revenue_by_plan_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_mrr bigint;
begin
  perform public._require_platform_admin();

  select coalesce(sum(public._admin_org_mrr_cents(s.plan_id, s.billing_interval, s.organization_id)), 0)
    into v_total_mrr
    from public.subscriptions s
    where public.get_effective_subscription_status(s) in ('active', 'past_due', 'cancel_at_period_end')
      and not public._is_internal_subscription(s);

  return (
    with base as (
      select
        s.plan_id, pl.name as plan_name, s.billing_interval,
        public._admin_org_mrr_cents(s.plan_id, s.billing_interval, s.organization_id) as mrr_cents
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      where public.get_effective_subscription_status(s) in ('active', 'past_due', 'cancel_at_period_end')
        and not public._is_internal_subscription(s)
    ),
    by_plan as (
      select plan_id, plan_name, count(*) as active_customers, sum(mrr_cents) as mrr_cents,
        sum(mrr_cents) filter (where billing_interval = 'monthly') as mrr_monthly_cents,
        sum(mrr_cents) filter (where billing_interval = 'yearly') as mrr_yearly_cents,
        count(*) filter (where billing_interval = 'monthly') as customers_monthly,
        count(*) filter (where billing_interval = 'yearly') as customers_yearly
      from base
      group by plan_id, plan_name
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'plan_id', plan_id, 'plan_name', plan_name,
      'active_customers', active_customers,
      'mrr_cents', mrr_cents,
      'share_pct', case when v_total_mrr > 0 then round(100.0 * mrr_cents / v_total_mrr, 1) else 0 end,
      'mrr_monthly_cents', coalesce(mrr_monthly_cents, 0),
      'mrr_yearly_cents', coalesce(mrr_yearly_cents, 0),
      'customers_monthly', coalesce(customers_monthly, 0),
      'customers_yearly', coalesce(customers_yearly, 0)
    ) order by mrr_cents desc), '[]'::jsonb)
    from by_plan
  );
end;
$function$;

-- 4. admin_revenue_lost_system
create or replace function public.admin_revenue_lost_system(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cancelled_cents bigint := 0;
  v_at_risk_cents bigint := 0;
  r record;
begin
  perform public._require_platform_admin();

  for r in
    select distinct h.organization_id, s.plan_id, s.billing_interval
    from public.subscription_status_history h
    join public.subscriptions s on s.organization_id = h.organization_id
    where h.reason = 'user_requested' and h.created_at::date between p_period_start and p_period_end
      and not public._is_internal_subscription(s)
  loop
    v_cancelled_cents := v_cancelled_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
  end loop;

  for r in
    select s.plan_id, s.billing_interval, s.organization_id
    from public.subscriptions s
    where public.get_effective_subscription_status(s) = 'past_due'
      and not public._is_internal_subscription(s)
  loop
    v_at_risk_cents := v_at_risk_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
  end loop;

  return jsonb_build_object(
    'mrr_cancelled_in_period_cents', v_cancelled_cents,
    'mrr_at_risk_past_due_cents', v_at_risk_cents,
    'note', 'Métricas derivadas do MRR normalizado das assinaturas — não representam movimentação de caixa.'
  );
end;
$function$;

-- 5. admin_upcoming_receivables_system
create or replace function public.admin_upcoming_receivables_system(p_days integer DEFAULT 60)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_end date := current_date + make_interval(days => p_days);
begin
  perform public._require_platform_admin();

  return (
    with issued as (
      select bc.due_date, bc.final_amount_cents, bc.status, o.name as organization_name, o.id as organization_id,
             bc.plan_id, pl.name as plan_name
      from public.billing_charges bc
      join public.organizations o on o.id = bc.organization_id
      left join public.plans pl on pl.id = bc.plan_id
      where bc.status in ('pending', 'overdue') and bc.due_date <= v_end
    ),
    by_month as (
      select date_trunc('month', due_date)::date as m, sum(final_amount_cents) as cents
      from issued group by 1
    ),
    upcoming_subs as (
      select s.organization_id, s.plan_id, s.billing_interval, s.current_period_end,
             s.pending_change_kind, s.pending_plan_id, s.pending_billing_interval, s.pending_change_price_cents
      from public.subscriptions s
      where s.status in ('active', 'past_due') and s.cancel_at_period_end = false
        and s.current_period_end is not null and s.current_period_end::date <= v_end
        and not public._is_internal_subscription(s)
    ),
    projected as (
      select
        us.organization_id, o.name as organization_name,
        us.current_period_end::date as due_date,
        case when us.pending_change_kind in ('cycle_change', 'downgrade')
          then us.pending_change_price_cents
          else public._admin_org_contracted_cents(us.plan_id, us.billing_interval, us.organization_id)
        end as amount_cents,
        case when us.pending_change_kind in ('cycle_change', 'downgrade') then us.pending_plan_id else us.plan_id end as plan_id,
        coalesce(plnew.name, plcur.name) as plan_name
      from upcoming_subs us
      join public.organizations o on o.id = us.organization_id
      left join public.plans plcur on plcur.id = us.plan_id
      left join public.plans plnew on plnew.id = us.pending_plan_id
      where not exists (
        select 1 from public.billing_charges bc
        where bc.organization_id = us.organization_id
          and bc.status in ('pending', 'overdue')
          and bc.due_date between us.current_period_end::date - 3 and us.current_period_end::date + 3
      )
    )
    select jsonb_build_object(
      'issued', coalesce((select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id, 'organization_name', organization_name,
        'due_date', due_date, 'amount_cents', final_amount_cents, 'status', status,
        'plan_id', plan_id, 'plan_name', plan_name
      ) order by due_date) from issued), '[]'::jsonb),
      'projected', coalesce((select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id, 'organization_name', organization_name,
        'due_date', due_date, 'amount_cents', amount_cents, 'plan_id', plan_id, 'plan_name', plan_name
      ) order by due_date) from projected), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'cents', cents) order by m) from by_month), '[]'::jsonb)
    )
  );
end;
$function$;

-- 6. admin_lead_metrics_system
create or replace function public.admin_lead_metrics_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  perform public._require_platform_admin();

  with base as (
    select b.*, p.deleted_at
    from public._admin_lead_base() b
    join public.profiles p on p.id = b.owner_user_id
    where p.deleted_at is null
      and not public._is_internal_subscription((b.sub))
  ),
  counted as (
    select commercial_status, count(*) as n from base group by commercial_status
  ),
  mrr_base as (
    select b.organization_id, (b.sub).plan_id as plan_id, (b.sub).billing_interval as billing_interval
    from base b
    where (b.sub).id is not null
      and public.get_effective_subscription_status(b.sub) in ('active', 'past_due', 'cancel_at_period_end')
  )
  select jsonb_build_object(
    'total_leads', (select count(*) from base),
    'by_status', (select coalesce(jsonb_object_agg(commercial_status, n), '{}'::jsonb) from counted),
    'trial_active', coalesce((select n from counted where commercial_status = 'trial_active'), 0),
    'trial_not_converted', coalesce((select n from counted where commercial_status = 'trial_not_converted'), 0),
    'active_customers', coalesce((select n from counted where commercial_status = 'active_customer'), 0),
    'past_due', coalesce((select n from counted where commercial_status = 'past_due'), 0),
    'expired_involuntary', coalesce((select n from counted where commercial_status = 'expired_involuntary'), 0),
    'cancelled', coalesce((select n from counted where commercial_status = 'cancelled'), 0),
    'trial_to_customer_conversion_pct',
      case when (select count(*) from base where commercial_status <> 'no_subscription') = 0 then 0
        else round(
          100.0 * (select count(*) from base where (sub).activated_at is not null)
          / (select count(*) from base where commercial_status <> 'no_subscription')
        , 1)
      end,
    'mrr_cents', coalesce((select sum(public._admin_org_mrr_cents(mb.plan_id, mb.billing_interval, mb.organization_id)) from mrr_base mb), 0),
    'funnel', jsonb_build_object(
      'signups', (select count(*) from base),
      'trials', (select count(*) from base where commercial_status <> 'no_subscription'),
      'paid_customers', (select count(*) from base where (sub).activated_at is not null)
    )
  )
  into v_result;

  return v_result;
end;
$function$;

-- 7. admin_executive_dashboard_system
create or replace function public.admin_executive_dashboard_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_financial jsonb;
  v_recurring jsonb;
  v_leads jsonb;
  v_goal public.admin_revenue_goals;
  v_by_month jsonb;
  v_by_plan jsonb;
  v_sync_issues jsonb;
  v_new_paid_month int;
  v_new_signups_month int;
  v_trials_ending_48h int;
  v_follow_ups_due int;
  v_cadastro int;
  v_trial int;
  v_dna int;
  v_instagram int;
  v_pago int;
begin
  perform public._require_platform_admin();

  v_financial := public.admin_financial_summary_system(v_month_start, v_month_end);
  v_recurring := public.admin_recurring_revenue_system();
  v_leads := public.admin_lead_metrics_system();
  v_goal := public.admin_get_revenue_goal_system(v_month_start);
  v_by_month := public.admin_revenue_by_month_system(6);
  v_by_plan := public.admin_revenue_by_plan_system();
  v_sync_issues := public.admin_list_asaas_sync_issues_system();

  select count(*) into v_new_paid_month
  from public.subscriptions s
  join public.organizations o on o.id = s.organization_id
  join public.profiles p on p.id = o.owner_user_id
  where p.deleted_at is null
    and s.activated_at::date between v_month_start and v_month_end
    and not public._is_internal_subscription(s);

  select count(*) into v_new_signups_month
  from public.organizations o
  join public.profiles p on p.id = o.owner_user_id
  left join public.subscriptions s2 on s2.organization_id = o.id
  where p.deleted_at is null
    and o.created_at::date between v_month_start and v_month_end
    and not public._is_internal_subscription(s2);

  select count(*) into v_trials_ending_48h
  from public.subscriptions s
  where public.get_effective_subscription_status(s) = 'trialing'
    and s.trial_ends_at between now() and now() + interval '48 hours'
    and not public._is_internal_subscription(s);

  select count(*) into v_follow_ups_due
  from public.lead_follow_ups f
  where f.status = 'pending' and f.due_at < current_date;

  with base as (
    select b.organization_id, b.workspace_id, b.commercial_status, (b.sub).activated_at as activated_at
    from public._admin_lead_base() b
    join public.profiles p on p.id = b.owner_user_id
    where p.deleted_at is null
      and not public._is_internal_subscription((b.sub))
  )
  select
    count(*),
    count(*) filter (where commercial_status <> 'no_subscription'),
    count(*) filter (where exists (select 1 from public.brand_profiles bp where bp.workspace_id = base.workspace_id and bp.onboarding_completed_at is not null)),
    count(*) filter (where exists (select 1 from public.instagram_accounts ia where ia.workspace_id = base.workspace_id and ia.last_connected_at is not null)),
    count(*) filter (where activated_at is not null)
  into v_cadastro, v_trial, v_dna, v_instagram, v_pago
  from base;

  return jsonb_build_object(
    'health', jsonb_build_object(
      'received_month_cents', v_financial->'received_cents',
      'mrr_cents', v_recurring->'mrr_cents',
      'active_customers', v_leads->'active_customers',
      'trial_active', v_leads->'trial_active'
    ),
    'commercial', jsonb_build_object(
      'new_paid_customers_month', v_new_paid_month,
      'new_signups_month', v_new_signups_month,
      'trial_to_customer_conversion_pct', v_leads->'trial_to_customer_conversion_pct',
      'past_due', v_leads->'past_due'
    ),
    'goal', jsonb_build_object(
      'month', v_month_start,
      'goal_cents', v_goal.goal_cents,
      'realized_cents', v_financial->'received_cents',
      'pct', case when v_goal.goal_cents is null or v_goal.goal_cents = 0 then null
        else round(100.0 * (v_financial->>'received_cents')::bigint / v_goal.goal_cents, 1) end
    ),
    'revenue_by_month', v_by_month,
    'funil_comercial', jsonb_build_object(
      'signups', v_cadastro,
      'trials', v_trial,
      'paid_customers', v_pago,
      'monotonic', (v_cadastro >= v_trial and v_trial >= v_pago)
    ),
    'ativacao_produto', jsonb_build_object(
      'denominator_label', 'organizações cadastradas',
      'denominator', v_cadastro,
      'dna_completed', jsonb_build_object(
        'count', v_dna,
        'pct', case when v_cadastro = 0 then null else round(100.0 * v_dna / v_cadastro, 1) end
      ),
      'instagram_connected', jsonb_build_object(
        'count', v_instagram,
        'pct', case when v_cadastro = 0 then null else round(100.0 * v_instagram / v_cadastro, 1) end
      )
    ),
    'revenue_by_plan', v_by_plan,
    'alerts', jsonb_build_object(
      'trials_ending_48h', v_trials_ending_48h,
      'past_due', v_leads->'past_due',
      'follow_ups_due', v_follow_ups_due,
      'asaas_sync_issues', jsonb_array_length(coalesce(v_sync_issues, '[]'::jsonb))
    )
  );
end;
$function$;
