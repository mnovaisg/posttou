drop function if exists public.apply_scheduled_downgrades_system();

create or replace function public.apply_scheduled_downgrades_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_to_sync jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  for v_row in
    select * from public.subscriptions
    where pending_change_kind in ('downgrade', 'cycle_change')
      and current_period_end is not null and current_period_end <= now()
    for update
  loop
    update public.subscriptions
    set plan_id = v_row.pending_plan_id, billing_interval = coalesce(v_row.pending_billing_interval, v_row.billing_interval),
        pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null, pending_change_price_cents = null,
        pending_change_new_recurring_cents = null,
        asaas_sync_status = case when v_row.asaas_subscription_id is not null and v_row.pending_change_price_cents is not null then 'pending' else asaas_sync_status end,
        asaas_sync_target_price_cents = case when v_row.asaas_subscription_id is not null and v_row.pending_change_price_cents is not null then v_row.pending_change_price_cents else asaas_sync_target_price_cents end,
        asaas_sync_last_error = case when v_row.asaas_subscription_id is not null and v_row.pending_change_price_cents is not null then null else asaas_sync_last_error end,
        updated_at = now()
    where organization_id = v_row.organization_id;

    insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
    values (
      v_row.organization_id, v_row.status, v_row.status,
      case when v_row.pending_change_kind = 'cycle_change' then 'cycle_change_applied_to_' || coalesce(v_row.pending_billing_interval::text, '')
           else 'plan_changed_to_' || v_row.pending_plan_id end
    );

    v_count := v_count + 1;

    if v_row.asaas_subscription_id is not null and v_row.pending_change_price_cents is not null then
      v_to_sync := v_to_sync || jsonb_build_object(
        'organization_id', v_row.organization_id,
        'asaas_subscription_id', v_row.asaas_subscription_id,
        'target_price_cents', v_row.pending_change_price_cents,
        'billing_interval', coalesce(v_row.pending_billing_interval, v_row.billing_interval)
      );
    end if;
  end loop;

  return jsonb_build_object('applied_count', v_count, 'to_sync', v_to_sync);
end;
$function$;

revoke execute on function public.apply_scheduled_downgrades_system() from public;
grant execute on function public.apply_scheduled_downgrades_system() to service_role;
