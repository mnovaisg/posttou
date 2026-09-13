alter table public.subscriptions drop constraint subscriptions_pending_change_kind_check;
alter table public.subscriptions add constraint subscriptions_pending_change_kind_check
  check (pending_change_kind = any (array['upgrade'::text, 'downgrade'::text, 'cycle_change'::text]));

-- Mudança de ciclo (mensal<->anual) — Opção A aprovada pelo usuário:
-- preço CONGELADO no momento da solicitação (lido de _admin_org_cycle_charge_cents
-- agora, nunca relido depois), sem cobrança/crédito/reembolso, agendada
-- para current_period_end. Reaproveita pending_change_price_cents com o
-- MESMO sentido que já tinha em downgrade: "valor que vigorará quando a
-- troca pendente for efetivada", não "valor cobrado agora" (nada é
-- cobrado agora). O motor de upgrade pró-rata (mesmo ciclo, status
-- active) continua absolutamente intocado abaixo.
create or replace function public.request_plan_change(
  p_organization_id uuid,
  p_new_plan_id text,
  p_new_billing_interval billing_interval,
  p_current_recurring_cents_hint bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_current_plan public.plans;
  v_new_plan public.plans;
  v_current_price bigint;
  v_new_price bigint;
  v_kind text;
  v_new_recurring_cents bigint;
  v_diff_cents bigint;
  v_total_seconds numeric;
  v_remaining_seconds numeric;
  v_fraction numeric;
  v_charge_cents bigint;
  v_use_proration boolean;
  v_frozen_cycle_price bigint;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then raise exception 'NO_SUBSCRIPTION_FOUND'; end if;

  select * into v_new_plan from public.plans where id = p_new_plan_id and is_active;
  if v_new_plan is null then raise exception 'INVALID_PLAN'; end if;

  -- Mudança de ciclo (mensal<->anual) fora do trial: agenda para o fim
  -- do período atual, congela o preço vigente AGORA — nunca cobra,
  -- nunca credita, nunca reduz o período já pago. Durante o trial,
  -- ainda não há período pago pra preservar, então mantém o
  -- comportamento antigo (troca imediata via o fluxo de upgrade/downgrade
  -- normal, sem passar por aqui).
  if p_new_billing_interval <> v_sub.billing_interval and v_sub.status <> 'trialing' then
    v_frozen_cycle_price := public._admin_org_cycle_charge_cents(p_new_plan_id, p_new_billing_interval, p_organization_id);

    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'cycle_change', pending_change_price_cents = v_frozen_cycle_price,
        pending_change_new_recurring_cents = null, updated_at = now()
    where organization_id = p_organization_id;

    perform public.log_audit_event(
      null, 'subscription_cycle_change_scheduled', 'subscriptions', null,
      jsonb_build_object(
        'organization_id', p_organization_id, 'from_billing_interval', v_sub.billing_interval,
        'to_billing_interval', p_new_billing_interval, 'new_plan_id', p_new_plan_id,
        'frozen_price_cents', v_frozen_cycle_price, 'effective_at', v_sub.current_period_end
      )
    );

    return jsonb_build_object(
      'kind', 'cycle_change', 'new_plan_id', p_new_plan_id, 'new_billing_interval', p_new_billing_interval,
      'new_price_cents', v_frozen_cycle_price, 'effective_at', v_sub.current_period_end
    );
  end if;

  select * into v_current_plan from public.plans where id = v_sub.plan_id;
  v_current_price := case when v_sub.billing_interval = 'monthly' then v_current_plan.price_monthly_cents else v_current_plan.price_yearly_cents end;
  v_new_price := case when p_new_billing_interval = 'monthly' then v_new_plan.price_monthly_cents else v_new_plan.price_yearly_cents end;

  v_kind := case when v_new_price > v_current_price then 'upgrade' else 'downgrade' end;

  if v_kind = 'downgrade' then
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'downgrade', pending_change_price_cents = v_new_price,
        pending_change_new_recurring_cents = null, updated_at = now()
    where organization_id = p_organization_id;

    return jsonb_build_object('kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_new_price);
  end if;

  v_new_recurring_cents := public._admin_org_cycle_charge_cents(p_new_plan_id, p_new_billing_interval, p_organization_id);
  v_use_proration := p_new_billing_interval = v_sub.billing_interval and v_sub.status = 'active' and p_current_recurring_cents_hint is not null;

  if v_use_proration then
    v_diff_cents := greatest(v_new_recurring_cents - p_current_recurring_cents_hint, 0);
    v_total_seconds := extract(epoch from (v_sub.current_period_end - v_sub.current_period_start))::numeric;
    v_remaining_seconds := greatest(extract(epoch from (v_sub.current_period_end - now()))::numeric, 0::numeric);
    v_fraction := case when v_total_seconds > 0 then least(v_remaining_seconds / v_total_seconds, 1::numeric) else 1::numeric end;
    v_charge_cents := round(v_diff_cents * v_fraction);

    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'upgrade', pending_change_price_cents = v_charge_cents,
        pending_change_new_recurring_cents = v_new_recurring_cents, updated_at = now()
    where organization_id = p_organization_id;

    return jsonb_build_object(
      'kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_charge_cents,
      'is_prorated', true, 'new_recurring_cents', v_new_recurring_cents,
      'current_recurring_cents', p_current_recurring_cents_hint, 'diff_cents', v_diff_cents,
      'fraction_remaining', v_fraction
    );
  else
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'upgrade', pending_change_price_cents = v_new_recurring_cents,
        pending_change_new_recurring_cents = null, updated_at = now()
    where organization_id = p_organization_id;

    return jsonb_build_object('kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_new_recurring_cents, 'is_prorated', false);
  end if;
end;
$function$;
