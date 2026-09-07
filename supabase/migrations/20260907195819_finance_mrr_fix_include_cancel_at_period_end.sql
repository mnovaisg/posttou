-- Bug real encontrado na auditoria do Dashboard Executivo: admin_recurring_revenue_system
-- e admin_revenue_by_plan_system filtravam a população de MRR com
-- get_effective_subscription_status(s) in ('active','past_due'), o que EXCLUI
-- assinaturas com status 'cancel_at_period_end' — clientes que cancelaram mas
-- ainda estão dentro do período já pago/ativo (current_period_end no futuro,
-- activated_at preenchido), ou seja, ainda geram receita recorrente até o fim
-- do período. Isso subestimava o MRR real do Financeiro (provado com dado real:
-- org 4a26d62c-... plano Profissional mensal R$199, cancel_at_period_end,
-- current_period_end futuro — não contado no MRR do Financeiro, mas
-- corretamente contado como active_customer pela lógica já aprovada do CRM
-- em _lead_commercial_status). Corrigido incluindo 'cancel_at_period_end' na
-- população de ambas as funções, mantendo consistência com a definição de
-- "cliente ativo" já usada em _lead_commercial_status.
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
    where public.get_effective_subscription_status(s) in ('active', 'past_due', 'cancel_at_period_end');

  return (
    with base as (
      select
        s.plan_id, pl.name as plan_name, s.billing_interval,
        public._admin_org_mrr_cents(s.plan_id, s.billing_interval, s.organization_id) as mrr_cents
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      where public.get_effective_subscription_status(s) in ('active', 'past_due', 'cancel_at_period_end')
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
