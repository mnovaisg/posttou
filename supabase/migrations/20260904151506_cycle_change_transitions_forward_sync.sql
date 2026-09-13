create or replace function public.run_subscription_status_transitions_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trial_expired integer;
  v_past_due_expired integer;
  v_cancelled integer;
  v_downgrades jsonb;
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
    'downgrades_applied', v_downgrades -> 'applied_count',
    'asaas_syncs_pending', v_downgrades -> 'to_sync'
  );
end;
$function$;
