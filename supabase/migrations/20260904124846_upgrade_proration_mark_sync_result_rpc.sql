-- Chamado pela Edge Function (webhook, com service_role) logo após o
-- PUT na Asaas, e também pelo retry manual do Admin (platform_admin,
-- authenticated). Guard por asaas_sync_target_price_cents = p_target_price_cents
-- evita que um retry atrasado sobrescreva um sync mais novo (se um
-- segundo upgrade já mudou o alvo enquanto o primeiro retry estava em
-- voo). Só age quando o status atual é 'pending' ou 'failed' — nunca
-- mexe numa linha já 'synced'.
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

  if v_row is null then
    return jsonb_build_object('status', 'no_matching_pending_sync')::subscriptions;
  end if;

  perform public.log_audit_event(
    null, case when p_success then 'asaas_subscription_sync_succeeded' else 'asaas_subscription_sync_failed' end,
    'subscriptions', null,
    jsonb_build_object('organization_id', p_organization_id, 'target_price_cents', p_target_price_cents, 'error', p_error)
  );

  return v_row;
end;
$$;

revoke execute on function public.mark_asaas_subscription_sync_result_system(uuid, integer, boolean, text) from public;
grant execute on function public.mark_asaas_subscription_sync_result_system(uuid, integer, boolean, text) to authenticated, service_role;
