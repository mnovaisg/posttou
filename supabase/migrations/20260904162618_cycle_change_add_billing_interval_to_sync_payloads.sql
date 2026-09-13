create or replace function public.process_asaas_upgrade_payment_confirmed_system(p_asaas_payment_id text, p_organization_id uuid, p_asaas_event_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_updated public.subscriptions;
begin
  begin
    insert into public.asaas_webhook_events (asaas_event_id, event_type, payload)
    values (p_asaas_event_id, 'PAYMENT_CONFIRMED_UPGRADE', jsonb_build_object('asaas_payment_id', p_asaas_payment_id, 'organization_id', p_organization_id));
  exception when unique_violation then
    return jsonb_build_object('status', 'already_processed');
  end;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;

  if v_sub.pending_change_kind is distinct from 'upgrade' or v_sub.pending_change_payment_id is distinct from p_asaas_payment_id then
    return jsonb_build_object('status', 'stale_or_mismatched_reference');
  end if;

  v_updated := public.apply_confirmed_plan_change_system(p_organization_id);

  update public.subscriptions set pending_change_payment_id = null, updated_at = now() where organization_id = p_organization_id;

  return jsonb_build_object(
    'status', 'processed', 'organization_id', p_organization_id,
    'asaas_subscription_id', v_updated.asaas_subscription_id,
    'billing_interval', v_updated.billing_interval,
    'asaas_sync_status', v_updated.asaas_sync_status,
    'asaas_sync_target_price_cents', v_updated.asaas_sync_target_price_cents
  );
end;
$function$;

create or replace function public.process_asaas_payment_confirmed_system(p_asaas_subscription_id text, p_asaas_event_id text, p_period_start timestamptz, p_period_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_was_pending boolean;
  v_updated public.subscriptions;
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
    v_updated := public.apply_confirmed_plan_change_system(v_sub.organization_id);
  end if;

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (v_sub.organization_id, v_sub.status, 'active', 'asaas_payment_confirmed');

  return jsonb_build_object(
    'status', 'processed', 'organization_id', v_sub.organization_id,
    'asaas_subscription_id', v_sub.asaas_subscription_id,
    'billing_interval', v_updated.billing_interval,
    'asaas_sync_status', v_updated.asaas_sync_status,
    'asaas_sync_target_price_cents', v_updated.asaas_sync_target_price_cents
  );
end;
$function$;
