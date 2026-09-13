-- Se pending_change_new_recurring_cents estava preenchido (motor novo de
-- pró-rata rodou), marca a assinatura como asaas_sync_status='pending'
-- com o valor-alvo — quem chama este RPC (o webhook) é responsável por
-- de fato fazer o PUT na Asaas em seguida e reportar o resultado via
-- mark_asaas_subscription_sync_result_system. Se estava null (trial,
-- troca de ciclo, fallback), não mexe em asaas_sync_status — comportamento
-- antigo preservado, nenhuma sincronização é sinalizada.
create or replace function public.apply_confirmed_plan_change_system(p_organization_id uuid)
returns subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_target_recurring integer;
begin
  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null or v_sub.pending_plan_id is null then
    raise exception 'NO_PENDING_PLAN_CHANGE';
  end if;

  v_target_recurring := v_sub.pending_change_new_recurring_cents;

  update public.subscriptions
  set plan_id = pending_plan_id, billing_interval = coalesce(pending_billing_interval, billing_interval),
      pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null, pending_change_price_cents = null,
      pending_change_new_recurring_cents = null,
      asaas_sync_status = case when v_target_recurring is not null then 'pending' else asaas_sync_status end,
      asaas_sync_target_price_cents = case when v_target_recurring is not null then v_target_recurring else asaas_sync_target_price_cents end,
      asaas_sync_last_error = case when v_target_recurring is not null then null else asaas_sync_last_error end,
      updated_at = now()
  where organization_id = p_organization_id
  returning * into v_sub;

  insert into public.subscription_status_history (organization_id, from_status, to_status, reason)
  values (p_organization_id, v_sub.status, v_sub.status, 'plan_changed_to_' || v_sub.plan_id);

  return v_sub;
end;
$function$;
