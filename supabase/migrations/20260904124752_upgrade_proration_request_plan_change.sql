-- p_current_recurring_cents_hint: valor REAL cobrado hoje na assinatura
-- Asaas, lido ao vivo pela Edge Function via GET /subscriptions/{id}
-- ANTES de chamar este RPC — nunca derivado de `plans`, porque o
-- cliente pode ser legado com preço diferente do plano atual na tabela.
-- Se vier null (falha ao consultar a Asaas, ou não há assinatura ainda),
-- cai no comportamento antigo (cobrança do preço cheio, sem pró-rata,
-- sem sincronização futura) — nunca quebra o fluxo.
--
-- O novo motor de pró-rata só roda quando: é upgrade, o ciclo não muda
-- (mensal→mensal ou anual→anual) e a assinatura está com status
-- 'active' (há um período pago em andamento pra ratear). Trial e troca
-- de ciclo continuam exatamente como antes — aguardando decisão
-- separada do usuário sobre a regra de mudança de intervalo.
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
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then raise exception 'NO_SUBSCRIPTION_FOUND'; end if;

  select * into v_new_plan from public.plans where id = p_new_plan_id and is_active;
  if v_new_plan is null then raise exception 'INVALID_PLAN'; end if;

  if p_new_billing_interval <> v_sub.billing_interval and v_sub.status <> 'trialing' then
    raise exception 'INTERVAL_CHANGE_NOT_SUPPORTED' using hint = 'Troca de ciclo (mensal/anual) em uma assinatura já ativa ainda não é suportada de forma segura. Fale com o suporte.';
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
    -- Fallback preservado: trial, mudança de ciclo, ou sem hint de preço
    -- atual disponível — cobra o preço cheio do novo plano, como sempre
    -- fez, e NÃO agenda sincronização futura da Asaas (pending_change_new_recurring_cents
    -- fica null de propósito).
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'upgrade', pending_change_price_cents = v_new_recurring_cents,
        pending_change_new_recurring_cents = null, updated_at = now()
    where organization_id = p_organization_id;

    return jsonb_build_object('kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_new_recurring_cents, 'is_prorated', false);
  end if;
end;
$function$;
