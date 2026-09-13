-- Série Recebido x Emitido por mês, só com dado real (nunca inventa
-- histórico anterior ao que existe em billing_charges).
create or replace function public.admin_revenue_by_month_system(p_months integer default 6)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_start date;
begin
  perform public._require_platform_admin();
  v_start := date_trunc('month', current_date - make_interval(months => greatest(p_months, 1) - 1))::date;

  return (
    with months as (
      select generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month')::date as m
    ),
    received as (
      select date_trunc('month', paid_at)::date as m, sum(final_amount_cents) as cents
      from public.billing_charges where status = 'paid' and paid_at >= v_start
      group by 1
    ),
    issued as (
      select date_trunc('month', due_date)::date as m, sum(final_amount_cents) as cents
      from public.billing_charges where due_date >= v_start
      group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', months.m,
      'received_cents', coalesce(received.cents, 0),
      'issued_cents', coalesce(issued.cents, 0)
    ) order by months.m), '[]'::jsonb)
    from months
    left join received on received.m = months.m
    left join issued on issued.m = months.m
  );
end;
$$;
revoke execute on function public.admin_revenue_by_month_system(integer) from public;
grant execute on function public.admin_revenue_by_month_system(integer) to authenticated;

-- Projeção de receita — sempre "baseada nas assinaturas atuais", nunca
-- previsão estatística/garantida.
create or replace function public.admin_revenue_projection_system(p_months integer default 3)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_start date := date_trunc('month', current_date)::date;
  v_end date;
begin
  perform public._require_platform_admin();
  v_end := (v_start + make_interval(months => greatest(p_months, 1)) - interval '1 day')::date;

  return (
    with months as (
      select generate_series(v_start, v_end, interval '1 month')::date as m
    ),
    proj as (
      select charge_month, sum(amount_cents) as cents
      from public._admin_projected_charges(v_start, v_end)
      group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', months.m,
      'projected_cents', coalesce(proj.cents, 0)
    ) order by months.m), '[]'::jsonb)
    from months left join proj on proj.charge_month = months.m
  );
end;
$$;
revoke execute on function public.admin_revenue_projection_system(integer) from public;
grant execute on function public.admin_revenue_projection_system(integer) to authenticated;

-- Receita por plano — clientes ativos, MRR e participação, com quebra mensal/anual.
create or replace function public.admin_revenue_by_plan_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total_mrr bigint;
begin
  perform public._require_platform_admin();

  select coalesce(sum(public._admin_org_mrr_cents(s.plan_id, s.billing_interval, s.organization_id)), 0)
    into v_total_mrr
    from public.subscriptions s
    where public.get_effective_subscription_status(s) in ('active', 'past_due');

  return (
    with base as (
      select
        s.plan_id, pl.name as plan_name, s.billing_interval,
        public._admin_org_mrr_cents(s.plan_id, s.billing_interval, s.organization_id) as mrr_cents
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      where public.get_effective_subscription_status(s) in ('active', 'past_due')
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
$$;
revoke execute on function public.admin_revenue_by_plan_system() from public;
grant execute on function public.admin_revenue_by_plan_system() to authenticated;
