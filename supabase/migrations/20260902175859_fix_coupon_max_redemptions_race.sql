
-- Bug real encontrado em teste de concorrência: a checagem de
-- max_redemptions (limite GLOBAL) só contava status='applied', mas a
-- reserva ('reserved') acontece ANTES da aplicação — duas organizações
-- diferentes podiam reservar a mesma última vaga simultaneamente (ambas
-- viam applied_count < max_redemptions, porque nenhuma tinha 'applied'
-- ainda), e só estourariam o limite depois, quando as duas tentassem
-- finalizar como 'applied'. Corrigido: conta 'reserved' + 'applied'
-- (uma reserva em andamento já consome a vaga, como reserva de estoque).
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
  v_active_count int;
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
    select count(*) into v_active_count
      from public.coupon_redemptions
      where coupon_id = p_coupon.id and status in ('reserved', 'applied') and organization_id <> p_organization_id;
    if v_active_count >= p_coupon.max_redemptions then
      return 'max_redemptions_reached';
    end if;
  end if;

  return 'ok';
end;
$function$;
