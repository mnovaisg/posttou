
-- Reserva atômica de uso do cupom — chamada só pela Edge Function de
-- checkout (service_role), DEPOIS que ela já confirmou org/plan válidos.
-- Trava por advisory lock no coupon_id pra serializar concorrência real
-- entre organizações diferentes disputando as últimas vagas de
-- max_redemptions (mesmo raciocínio de pg_advisory_xact_lock já usado em
-- claim_pilot_workspace_for_planning). Idempotente: uma segunda chamada
-- pela MESMA organização para o MESMO cupom encontra a linha já existente
-- (reserved/failed) e a reaproveita ao invés de duplicar — nunca cria uma
-- segunda reserva pra mesma dupla (coupon, organization), graças ao
-- unique index. Se já estiver 'applied', recusa (cupom já usado).
create or replace function public.reserve_coupon_redemption_system(
  p_organization_id uuid,
  p_code text,
  p_plan_id text,
  p_billing_interval public.billing_interval
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_coupon public.coupons;
  v_plan public.plans;
  v_reason text;
  v_original_cents bigint;
  v_discount_cents bigint;
  v_redemption public.coupon_redemptions;
begin
  select * into v_coupon from public.coupons where code_normalized = lower(trim(p_code));
  if v_coupon.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtext('coupon_redeem:' || v_coupon.id::text));

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if v_plan.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_plan');
  end if;

  -- Idempotência: já existe reserva/aplicação desta org pra este cupom?
  select * into v_redemption from public.coupon_redemptions
    where coupon_id = v_coupon.id and organization_id = p_organization_id
    for update;

  if v_redemption.id is not null then
    if v_redemption.status = 'applied' then
      return jsonb_build_object('ok', false, 'reason', 'already_redeemed_by_organization');
    end if;
    -- reserved ou failed de uma tentativa anterior: reaproveita a mesma
    -- linha (idempotência real de retry), recalculando com os dados
    -- atuais do plano/cupom.
    v_original_cents := case when p_billing_interval = 'monthly' then v_plan.price_monthly_cents else v_plan.price_yearly_cents end;
    v_reason := public._validate_coupon_eligibility(v_coupon, p_organization_id, p_plan_id, p_billing_interval);
    if v_reason <> 'ok' then
      return jsonb_build_object('ok', false, 'reason', v_reason);
    end if;
    v_discount_cents := public._compute_coupon_discount(v_coupon, v_original_cents);
    update public.coupon_redemptions set
      plan_id = p_plan_id,
      billing_interval = p_billing_interval,
      original_amount_cents = v_original_cents,
      discount_amount_cents = v_discount_cents,
      final_amount_cents = v_original_cents - v_discount_cents,
      status = 'reserved',
      failure_reason = null,
      updated_at = now()
    where id = v_redemption.id
    returning * into v_redemption;
  else
    v_reason := public._validate_coupon_eligibility(v_coupon, p_organization_id, p_plan_id, p_billing_interval);
    if v_reason <> 'ok' then
      return jsonb_build_object('ok', false, 'reason', v_reason);
    end if;
    v_original_cents := case when p_billing_interval = 'monthly' then v_plan.price_monthly_cents else v_plan.price_yearly_cents end;
    v_discount_cents := public._compute_coupon_discount(v_coupon, v_original_cents);
    insert into public.coupon_redemptions (
      coupon_id, organization_id, plan_id, billing_interval,
      original_amount_cents, discount_amount_cents, final_amount_cents, status
    ) values (
      v_coupon.id, p_organization_id, p_plan_id, p_billing_interval,
      v_original_cents, v_discount_cents, v_original_cents - v_discount_cents, 'reserved'
    )
    returning * into v_redemption;
  end if;

  return jsonb_build_object(
    'ok', true,
    'redemptionId', v_redemption.id,
    'couponId', v_coupon.id,
    'code', v_coupon.code,
    'duration', v_coupon.duration,
    'discountType', v_coupon.discount_type,
    'originalAmountCents', v_redemption.original_amount_cents,
    'discountAmountCents', v_redemption.discount_amount_cents,
    'finalAmountCents', v_redemption.final_amount_cents
  );
end;
$function$;

-- Fecha a reserva depois que a Edge Function realmente criou os objetos
-- no Asaas (ou falhou ao criar) — só assim o cupom conta como "usado" de
-- verdade. Nunca marca 'applied' antes de confirmar que a cobrança no
-- Asaas foi criada com o valor correto.
create or replace function public.finalize_coupon_redemption_system(
  p_redemption_id uuid,
  p_status public.coupon_redemption_status,
  p_subscription_id uuid default null,
  p_asaas_subscription_id text default null,
  p_asaas_payment_id text default null,
  p_failure_reason text default null
) returns public.coupon_redemptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.coupon_redemptions;
begin
  update public.coupon_redemptions set
    status = p_status,
    subscription_id = coalesce(p_subscription_id, subscription_id),
    asaas_subscription_id = coalesce(p_asaas_subscription_id, asaas_subscription_id),
    asaas_payment_id = coalesce(p_asaas_payment_id, asaas_payment_id),
    failure_reason = p_failure_reason,
    updated_at = now()
  where id = p_redemption_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.reserve_coupon_redemption_system(uuid, text, text, public.billing_interval) from public, authenticated, anon;
revoke all on function public.finalize_coupon_redemption_system(uuid, public.coupon_redemption_status, uuid, text, text, text) from public, authenticated, anon;
grant execute on function public.reserve_coupon_redemption_system(uuid, text, text, public.billing_interval) to service_role;
grant execute on function public.finalize_coupon_redemption_system(uuid, public.coupon_redemption_status, uuid, text, text, text) to service_role;
