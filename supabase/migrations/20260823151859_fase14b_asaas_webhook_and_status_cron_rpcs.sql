-- Idempotência: todo processamento de webhook insere primeiro em
-- asaas_webhook_events (unique asaas_event_id); se já existir, a função
-- retorna 'already_processed' sem nenhum efeito colateral — nunca concede
-- franquia/ativa assinatura duas vezes por reentrega do mesmo evento.
create or replace function public.process_asaas_payment_confirmed_system(
  p_asaas_subscription_id text,
  p_asaas_event_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
  v_was_pending boolean;
begin
  begin
    insert into public.asaas_webhook_events (asaas_event_id, event_type, payload)
    values (p_asaas_event_id, 'PAYMENT_CONFIRMED', jsonb_build_object('asaas_subscription_id', p_asaas_subscription_id));
  exception when unique_violation then
    return jsonb_build_object('status', 'already_processed');
  end;

  select * into v_sub from public.subscriptions where asaas_subscription_id = p_asaas_subscription_id for update;
  if v_sub is null then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;

  v_was_pending := v_sub.pending_plan_id is not null and v_sub.pending_change_kind = 'upgrade';

  update public.subscriptions
  set status = 'active',
      activated_at = coalesce(activated_at, now()),
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      past_due_since = null,
      updated_at = now()
  where organization_id = v_sub.organization_id;

  if v_was_pending then
    perform public.apply_confirmed_plan_change_system(v_sub.organization_id);
  end if;

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (v_sub.organization_id, v_sub.status, 'active', 'asaas_payment_confirmed');

  return jsonb_build_object('status', 'processed', 'organization_id', v_sub.organization_id);
end;
$$;

grant execute on function public.process_asaas_payment_confirmed_system(text, text, timestamptz, timestamptz) to service_role;

create or replace function public.process_asaas_payment_overdue_system(p_asaas_subscription_id text, p_asaas_event_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
begin
  begin
    insert into public.asaas_webhook_events (asaas_event_id, event_type, payload)
    values (p_asaas_event_id, 'PAYMENT_OVERDUE', jsonb_build_object('asaas_subscription_id', p_asaas_subscription_id));
  exception when unique_violation then
    return jsonb_build_object('status', 'already_processed');
  end;

  select * into v_sub from public.subscriptions where asaas_subscription_id = p_asaas_subscription_id for update;
  if v_sub is null then return jsonb_build_object('status', 'subscription_not_found'); end if;

  update public.subscriptions
  set status = 'past_due', past_due_since = coalesce(past_due_since, now()), updated_at = now()
  where organization_id = v_sub.organization_id and status <> 'past_due';

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (v_sub.organization_id, v_sub.status, 'past_due', 'asaas_payment_overdue');

  return jsonb_build_object('status', 'processed', 'organization_id', v_sub.organization_id);
end;
$$;

grant execute on function public.process_asaas_payment_overdue_system(text, text) to service_role;

-- Cron diário: converte estados "efetivos" (calculados sob demanda por
-- get_effective_subscription_status) em estado gravado, para relatórios/UI
-- não dependerem de recalcular toda vez, e dispara os eventos de auditoria
-- do funil comercial (item 19). O bloqueio de acesso em si NUNCA depende
-- deste cron ter rodado — os gates (trigger + check_subscription_entitlement)
-- já usam o status efetivo diretamente.
create or replace function public.run_subscription_status_transitions_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_trial_expired integer;
  v_past_due_expired integer;
  v_cancelled integer;
  v_downgrades integer;
begin
  with due as (
    select organization_id, status as from_status from public.subscriptions
    where status = 'trialing' and trial_ends_at < now()
  )
  update public.subscriptions s set status = 'expired', updated_at = now()
  from due where s.organization_id = due.organization_id;
  get diagnostics v_trial_expired = row_count;

  with due as (
    select organization_id, status as from_status from public.subscriptions
    where status = 'past_due' and past_due_since is not null and now() > past_due_since + make_interval(days => past_due_grace_days)
  )
  update public.subscriptions s set status = 'expired', updated_at = now()
  from due where s.organization_id = due.organization_id;
  get diagnostics v_past_due_expired = row_count;

  with due as (
    select organization_id from public.subscriptions
    where status = 'cancel_at_period_end' and current_period_end is not null and current_period_end < now()
  )
  update public.subscriptions s set status = 'cancelled', updated_at = now()
  from due where s.organization_id = due.organization_id;
  get diagnostics v_cancelled = row_count;

  v_downgrades := public.apply_scheduled_downgrades_system();

  return jsonb_build_object(
    'trial_expired', v_trial_expired,
    'past_due_expired', v_past_due_expired,
    'cancelled', v_cancelled,
    'downgrades_applied', v_downgrades
  );
end;
$$;

grant execute on function public.run_subscription_status_transitions_system() to service_role;
