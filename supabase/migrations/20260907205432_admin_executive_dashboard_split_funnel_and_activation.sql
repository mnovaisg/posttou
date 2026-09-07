-- Ajuste aprovado após revisão do usuário: o funil principal
-- (Cadastro → Trial → DNA → Instagram → Pago) misturava progressão
-- comercial real com passos de ativação de produto opcionais. Dado real
-- provou que "Instagram conectado" NÃO é pré-requisito de pagamento
-- (instagram_connected=1 < paid_customers=6), então apresentá-lo como
-- etapa de funil sequencial era enganoso, mesmo com o aviso de
-- 'monotonic:false'. Separado em dois blocos:
--   - funil_comercial: Cadastro → Trial → Pago (as três etapas que SÃO
--     necessariamente sequenciais na jornada comercial real — pagar exige
--     ter cadastro e trial, então isso é estruturalmente monotônico, não
--     apenas empiricamente).
--   - ativacao_produto: DNA concluído / Instagram conectado, cada um com
--     contagem E percentual sobre um denominador EXPLÍCITO (organizações
--     cadastradas), sem forçar uma progressão sequencial entre os dois
--     nem com o funil comercial. Radar/Piloto continuam de fora
--     (nenhuma definição de "usuário ativo" desses recursos foi
--     inventada).
-- Nenhuma lógica financeira foi tocada; só reorganização do payload já
-- calculado pelo mesmo orquestrador, numa única ida ao banco.
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
    and s.activated_at::date between v_month_start and v_month_end;

  select count(*) into v_new_signups_month
  from public.organizations o
  join public.profiles p on p.id = o.owner_user_id
  where p.deleted_at is null
    and o.created_at::date between v_month_start and v_month_end;

  select count(*) into v_trials_ending_48h
  from public.subscriptions s
  where public.get_effective_subscription_status(s) = 'trialing'
    and s.trial_ends_at between now() and now() + interval '48 hours';

  select count(*) into v_follow_ups_due
  from public.lead_follow_ups f
  where f.status = 'pending' and f.due_at < current_date;

  with base as (
    select b.organization_id, b.workspace_id, b.commercial_status, (b.sub).activated_at as activated_at
    from public._admin_lead_base() b
    join public.profiles p on p.id = b.owner_user_id
    where p.deleted_at is null
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
