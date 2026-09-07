-- Ajuste após corrigir o bug real do Financeiro (finance_mrr_fix_include_cancel_at_period_end):
-- a população de MRR do CRM passa a usar exatamente a mesma condição de
-- get_effective_subscription_status(...) in ('active','past_due','cancel_at_period_end')
-- usada em admin_recurring_revenue_system/admin_revenue_by_plan_system, em vez de
-- commercial_status in ('active_customer','past_due') — elimina a possibilidade de
-- as duas definições divergirem novamente no futuro caso commercial_status ganhe
-- novos estados. Uma única fonte de verdade para "é MRR" nos dois lados.
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
  ),
  counted as (
    select commercial_status, count(*) as n from base group by commercial_status
  ),
  mrr_base as (
    select b.organization_id, (b.sub).plan_id as plan_id, (b.sub).billing_interval as billing_interval
    from base b
    where (b.sub) is not null
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
