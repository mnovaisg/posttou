-- Cancela uma troca agendada (downgrade OU cycle_change) enquanto ainda
-- não foi efetivada. Nunca cancela um upgrade aguardando confirmação de
-- pagamento (isso é outro fluxo — release_stale_upgrade_system, via
-- webhook de PAYMENT_OVERDUE/CANCELED).
create or replace function public.cancel_scheduled_plan_change_system(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
  v_row public.subscriptions;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then raise exception 'NO_SUBSCRIPTION_FOUND'; end if;

  if v_sub.pending_change_kind is null or v_sub.pending_change_kind not in ('downgrade', 'cycle_change') then
    raise exception 'NO_CANCELLABLE_PENDING_CHANGE';
  end if;

  update public.subscriptions
  set pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null,
      pending_change_price_cents = null, pending_change_new_recurring_cents = null, updated_at = now()
  where organization_id = p_organization_id
  returning * into v_row;

  perform public.log_audit_event(
    null, 'subscription_scheduled_change_cancelled', 'subscriptions', null,
    jsonb_build_object('organization_id', p_organization_id, 'cancelled_kind', v_sub.pending_change_kind, 'cancelled_pending_plan_id', v_sub.pending_plan_id)
  );

  return v_row;
end;
$$;

revoke execute on function public.cancel_scheduled_plan_change_system(uuid) from public;
grant execute on function public.cancel_scheduled_plan_change_system(uuid) to authenticated;

-- Leitura da troca agendada pra exibir no Billing (nome do plano de
-- destino, ciclo de destino, preço congelado, data de efetivação).
create or replace function public.get_organization_pending_plan_change_system(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub public.subscriptions;
  v_plan public.plans;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id;
  if v_sub is null or v_sub.pending_change_kind is null or v_sub.pending_change_kind not in ('downgrade', 'cycle_change') then
    return jsonb_build_object('has_pending', false);
  end if;

  select * into v_plan from public.plans where id = v_sub.pending_plan_id;

  return jsonb_build_object(
    'has_pending', true,
    'kind', v_sub.pending_change_kind,
    'pending_plan_id', v_sub.pending_plan_id,
    'pending_plan_name', v_plan.name,
    'pending_billing_interval', v_sub.pending_billing_interval,
    'pending_price_cents', v_sub.pending_change_price_cents,
    'effective_at', v_sub.current_period_end,
    'current_plan_id', v_sub.plan_id,
    'current_billing_interval', v_sub.billing_interval
  );
end;
$$;

revoke execute on function public.get_organization_pending_plan_change_system(uuid) from public;
grant execute on function public.get_organization_pending_plan_change_system(uuid) to authenticated;
