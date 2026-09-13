create or replace function public.mark_asaas_subscription_sync_result_system(
  p_organization_id uuid,
  p_target_price_cents integer,
  p_success boolean,
  p_error text default null
)
returns subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_row public.subscriptions;
begin
  if v_jwt_role <> 'service_role' and not public.is_platform_admin(auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.subscriptions
  set
    asaas_sync_status = case when p_success then 'synced' else 'failed' end,
    asaas_sync_target_price_cents = case when p_success then null else asaas_sync_target_price_cents end,
    asaas_sync_last_error = case when p_success then null else p_error end,
    asaas_sync_attempted_at = now()
  where organization_id = p_organization_id
    and asaas_sync_target_price_cents = p_target_price_cents
    and asaas_sync_status in ('pending', 'failed')
  returning * into v_row;

  if v_row.organization_id is not null then
    perform public.log_audit_event(
      null, case when p_success then 'asaas_subscription_sync_succeeded' else 'asaas_subscription_sync_failed' end,
      'subscriptions', null,
      jsonb_build_object('organization_id', p_organization_id, 'target_price_cents', p_target_price_cents, 'error', p_error)
    );
  end if;

  return v_row;
end;
$$;
