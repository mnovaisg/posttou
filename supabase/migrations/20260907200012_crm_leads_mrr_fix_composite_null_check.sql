-- Bug introduzido na migration anterior (crm_leads_mrr_align_population_with_financeiro):
-- `(b.sub) is not null` em um tipo composto (subscriptions) NÃO funciona como
-- verificação simples de "existe assinatura". Pelo padrão SQL, ROW(...) IS NOT NULL
-- só é true quando TODOS os campos da linha são não-nulos — como toda assinatura
-- real tem campos legitimamente nulos (ex.: past_due_since, pending_plan_id),
-- essa condição excluía SEMPRE todas as assinaturas reais, zerando mrr_base e
-- fazendo mrr_cents retornar 0 mesmo com clientes ativos. Corrigido checando um
-- campo escalar (id) em vez do composto inteiro.
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
