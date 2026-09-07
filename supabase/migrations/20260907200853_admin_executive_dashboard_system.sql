-- Bloco Dashboard Executivo do Admin: orquestrador aprovado. Não recalcula
-- nem reimplementa nenhuma lógica financeira — reutiliza os RPCs já
-- aprovados (admin_financial_summary_system, admin_recurring_revenue_system,
-- admin_lead_metrics_system, admin_revenue_by_month_system,
-- admin_revenue_by_plan_system, admin_list_asaas_sync_issues_system,
-- admin_get_revenue_goal_system) numa única ida ao banco (uma chamada RPC do
-- frontend), evitando N+1. Novidades calculadas aqui (não existiam em nenhum
-- RPC anterior): novos cadastros/novos clientes pagos no mês, trials vencendo
-- em 48h, follow-ups vencidos, e o funil oficial v1 de 5 estágios
-- (Cadastro → Trial → DNA concluído → Instagram conectado → Pago), sempre
-- medindo a MESMA organização em progressão (nunca somas de populações
-- independentes) — construído sobre _admin_lead_base(), a mesma fonte já
-- usada pelo CRM. O funil expõe 'monotonic' explicitamente: se a sequência
-- não for decrescente (ex.: Instagram conectado < Pago, porque conectar
-- Instagram não é obrigatório antes do pagamento no fluxo real do produto),
-- o valor fica false e a UI deve mostrar isso com uma ressalva — nunca
-- mascarar ou reordenar os estágios pra esconder o problema.
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
    'funnel', jsonb_build_object(
      'signups', v_cadastro,
      'trials', v_trial,
      'dna_completed', v_dna,
      'instagram_connected', v_instagram,
      'paid_customers', v_pago,
      'monotonic', (v_cadastro >= v_trial and v_trial >= v_dna and v_dna >= v_instagram and v_instagram >= v_pago)
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

revoke all on function public.admin_executive_dashboard_system() from public;
grant execute on function public.admin_executive_dashboard_system() to authenticated;
