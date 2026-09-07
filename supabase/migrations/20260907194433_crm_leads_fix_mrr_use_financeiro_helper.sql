-- Bug encontrado na auditoria do Dashboard Executivo: admin_lead_metrics_system
-- calculava seu próprio MRR lendo plans.price_monthly_cents/price_yearly_cents
-- direto, criando uma SEGUNDA definição de MRR divergente da já aprovada e
-- corrigida no bloco Financeiro (_admin_org_mrr_cents/_admin_org_contracted_cents:
-- valor recorrente contratado real, proteção de preço legado, exclusão de
-- cobrança avulsa/pró-rata, first_payment nunca reduz MRR permanente,
-- recurring respeitado, anual /12). Corrigido reaproveitando o MESMO helper —
-- nunca reimplementado aqui. População agora idêntica à do Financeiro
-- (commercial_status in ('active_customer','past_due'), equivalente a
-- get_effective_subscription_status in ('active','past_due') usado em
-- admin_recurring_revenue_system), garantindo que os dois números batem
-- exatamente. Campo renomeado de mrr_gross_cents/mrr_recurring_discount_cents
-- (que sugeriam "bruto - desconto" separados, o que não existe mais depois
-- do fix, já que o helper devolve o valor líquido/contratado direto) para
-- um único mrr_cents — evita rótulo enganoso na tela.
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
    where b.commercial_status in ('active_customer', 'past_due')
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
