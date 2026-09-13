
-- Validação central compartilhada por preview e reserve. Nunca decide
-- nada sozinha por fora de uma transação que já tenha a linha do cupom
-- travada pelo chamador quando for a etapa de reserva de verdade.
create or replace function public._validate_coupon_eligibility(
  p_coupon public.coupons,
  p_organization_id uuid,
  p_plan_id text,
  p_billing_interval public.billing_interval
) returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_applied_count int;
  v_org_used boolean;
begin
  if not p_coupon.active then
    return 'inactive';
  end if;
  if p_coupon.starts_at is not null and now() < p_coupon.starts_at then
    return 'not_started';
  end if;
  if p_coupon.expires_at is not null and now() > p_coupon.expires_at then
    return 'expired';
  end if;
  if p_coupon.eligible_plan_ids is not null and array_length(p_coupon.eligible_plan_ids, 1) is not null
     and not (p_plan_id = any(p_coupon.eligible_plan_ids)) then
    return 'plan_not_eligible';
  end if;
  if p_coupon.eligible_billing_intervals is not null and array_length(p_coupon.eligible_billing_intervals, 1) is not null
     and not (p_billing_interval = any(p_coupon.eligible_billing_intervals)) then
    return 'interval_not_eligible';
  end if;

  select exists(
    select 1 from public.coupon_redemptions
    where coupon_id = p_coupon.id and organization_id = p_organization_id and status = 'applied'
  ) into v_org_used;
  if v_org_used then
    return 'already_redeemed_by_organization';
  end if;

  if p_coupon.max_redemptions is not null then
    select count(*) into v_applied_count from public.coupon_redemptions where coupon_id = p_coupon.id and status = 'applied';
    if v_applied_count >= p_coupon.max_redemptions then
      return 'max_redemptions_reached';
    end if;
  end if;

  return 'ok';
end;
$function$;

-- Cálculo do desconto — nunca recebe discount_value do chamador, sempre
-- lê da própria linha do cupom já validada. Fixed nunca deixa o valor
-- final negativo (trava em 0), percentage sempre 0-100 (já garantido por
-- CHECK constraint na tabela).
create or replace function public._compute_coupon_discount(
  p_coupon public.coupons,
  p_original_amount_cents bigint
) returns bigint
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_discount_cents bigint;
begin
  if p_coupon.discount_type = 'percentage' then
    v_discount_cents := round(p_original_amount_cents * (p_coupon.discount_value / 100.0));
  else
    v_discount_cents := round(p_coupon.discount_value * 100);
  end if;
  if v_discount_cents > p_original_amount_cents then
    v_discount_cents := p_original_amount_cents;
  end if;
  if v_discount_cents < 0 then
    v_discount_cents := 0;
  end if;
  return v_discount_cents;
end;
$function$;

-- Preview: só leitura, seguro pra chamar a cada tecla/clique em "Aplicar"
-- — nunca reserva, nunca consome o cupom. Usado pela UX de checkout antes
-- de o usuário confirmar.
create or replace function public.preview_coupon(
  p_organization_id uuid,
  p_code text,
  p_plan_id text,
  p_billing_interval public.billing_interval
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_coupon public.coupons;
  v_plan public.plans;
  v_reason text;
  v_original_cents bigint;
  v_discount_cents bigint;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Sem acesso a esta organização.';
  end if;

  select * into v_coupon from public.coupons where code_normalized = lower(trim(p_code));
  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if v_plan.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid_plan');
  end if;

  v_reason := public._validate_coupon_eligibility(v_coupon, p_organization_id, p_plan_id, p_billing_interval);
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
$function$;

grant execute on function public.preview_coupon(uuid, text, text, public.billing_interval) to authenticated;
