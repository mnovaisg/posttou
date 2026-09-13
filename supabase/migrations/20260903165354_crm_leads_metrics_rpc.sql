-- Cards + funil, tudo derivado ao vivo (nada armazenado/cacheado).
-- MRR = soma do preço de tabela mensal-equivalente de quem está em
-- active_customer; MRR com desconto recorrente = subtrai o desconto de
-- cupom com duration='recurring' ainda em vigor (status applied). Os
-- dois números aparecem separados — nunca misturados num só valor
-- inventado (aprovado: "não inventar métricas").
create or replace function public.admin_lead_metrics_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
    select
      b.organization_id,
      case when b.sub.billing_interval = 'monthly' then pl.price_monthly_cents
           else round(pl.price_yearly_cents / 12.0) end as monthly_equiv_cents
    from base b
    join public.plans pl on pl.id = b.sub.plan_id
    where b.commercial_status = 'active_customer'
  ),
  recurring_discounts as (
    select cr.organization_id, sum(cr.discount_amount_cents) as discount_cents
    from public.coupon_redemptions cr
    join public.coupons c on c.id = cr.coupon_id
    where cr.status = 'applied' and c.duration = 'recurring'
    group by cr.organization_id
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
    'mrr_gross_cents', coalesce((select sum(monthly_equiv_cents) from mrr_base), 0),
    'mrr_recurring_discount_cents', coalesce((
      select sum(rd.discount_cents) from recurring_discounts rd
      where rd.organization_id in (select organization_id from mrr_base)
    ), 0),
    'funnel', jsonb_build_object(
      'signups', (select count(*) from base),
      'trials', (select count(*) from base where commercial_status <> 'no_subscription'),
      'paid_customers', (select count(*) from base where (sub).activated_at is not null)
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_lead_metrics_system() from public;
grant execute on function public.admin_lead_metrics_system() to authenticated;
