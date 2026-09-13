
create or replace function public.admin_create_coupon_system(
  p_code text,
  p_discount_type public.coupon_discount_type,
  p_discount_value numeric,
  p_duration public.coupon_duration,
  p_eligible_plan_ids text[] default null,
  p_eligible_billing_intervals public.billing_interval[] default null,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_max_redemptions int default null,
  p_max_redemptions_per_organization int default 1,
  p_active boolean default true
)
returns public.coupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code_normalized text := upper(trim(p_code));
  v_coupon public.coupons;
begin
  perform public._require_platform_admin();

  if v_code_normalized is null or v_code_normalized = '' then
    raise exception 'INVALID_CODE';
  end if;
  if p_discount_type = 'percentage' and (p_discount_value <= 0 or p_discount_value > 100) then
    raise exception 'INVALID_PERCENTAGE_VALUE';
  end if;
  if p_discount_type = 'fixed' and p_discount_value <= 0 then
    raise exception 'INVALID_FIXED_VALUE';
  end if;

  -- code_normalized é coluna gerada (derivada de code) — nunca inserida
  -- diretamente, só code.
  insert into public.coupons (
    code, discount_type, discount_value, duration,
    eligible_plan_ids, eligible_billing_intervals, starts_at, expires_at,
    max_redemptions, max_redemptions_per_organization, active, created_by
  ) values (
    v_code_normalized, p_discount_type, p_discount_value, p_duration,
    p_eligible_plan_ids, p_eligible_billing_intervals, p_starts_at, p_expires_at,
    p_max_redemptions, p_max_redemptions_per_organization, p_active, auth.uid()
  )
  returning * into v_coupon;

  perform public.log_audit_event(null, 'admin_coupon_created', 'coupon', v_coupon.id, jsonb_build_object('code', v_coupon.code));

  return v_coupon;
end;
$$;
