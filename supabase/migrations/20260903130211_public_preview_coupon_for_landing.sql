-- Ajuste cupom na Landing — variante pública de preview_coupon, sem
-- exigir organizacao (ainda nao existe antes do cadastro). Reutiliza
-- integralmente a mesma logica de elegibilidade/desconto
-- (_validate_coupon_eligibility, _compute_coupon_discount) — nenhuma
-- regra nova, nenhum dado sensivel exposto (mesmo shape de retorno do
-- preview_coupon autenticado: sem contagem de resgates, sem
-- organizacoes, sem IDs internos). Passar organization_id nulo faz os
-- dois criterios ligados a organizacao (ja resgatado por esta org,
-- limite considerando esta org) nunca bloquearem aqui — a
-- reserva/aplicacao real no checkout (reserve_coupon_redemption_system)
-- sempre revalida com a organizacao de verdade antes de cobrar, entao
-- esse preview pre-cadastro e so uma previa, nunca a autoridade final.
create or replace function public.public_preview_coupon(
  p_code text,
  p_plan_id text,
  p_billing_interval billing_interval
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_coupon public.coupons;
  v_plan public.plans;
  v_reason text;
  v_original_cents bigint;
  v_discount_cents bigint;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  select * into v_coupon from public.coupons where code_normalized = lower(trim(p_code));
  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if v_plan.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid_plan');
  end if;

  v_reason := public._validate_coupon_eligibility(v_coupon, null, p_plan_id, p_billing_interval);
  if v_reason <> 'ok' then
    return jsonb_build_object('valid', false, 'reason', v_reason);
  end if;

  v_original_cents := case when p_billing_interval = 'monthly' then v_plan.price_monthly_cents else v_plan.price_yearly_cents end;
  v_discount_cents := public._compute_coupon_discount(v_coupon, v_original_cents);

  return jsonb_build_object(
    'valid', true,
    'code', v_coupon.code,
    'discountType', v_coupon.discount_type,
    'duration', v_coupon.duration,
    'originalAmountCents', v_original_cents,
    'discountAmountCents', v_discount_cents,
    'finalAmountCents', v_original_cents - v_discount_cents
  );
end;
$$;

grant execute on function public.public_preview_coupon(text, text, billing_interval) to anon, authenticated;
