-- Upsert idempotente por asaas_payment_id — chamado pelo webhook
-- (service_role, evento real de payment) e pelo backfill administrativo
-- (também via client service_role dentro da Edge Function, mas só
-- alcançada depois de _require_platform_admin() checado na própria
-- función/edge function chamadora). Nunca mexe em subscriptions,
-- créditos ou entitlement — só grava o fato financeiro.
create or replace function public.upsert_billing_charge_system(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_asaas_payment_id text,
  p_asaas_subscription_id text,
  p_plan_id text,
  p_billing_interval billing_interval,
  p_kind text,
  p_original_amount_cents bigint,
  p_discount_amount_cents bigint,
  p_final_amount_cents bigint,
  p_coupon_redemption_id uuid,
  p_due_date date,
  p_paid_at timestamptz,
  p_status text,
  p_raw_asaas_status text,
  p_source text
)
returns public.billing_charges
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.billing_charges;
  v_jwt_role text;
begin
  v_jwt_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  if v_jwt_role <> 'service_role' and not public.is_platform_admin(auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  insert into public.billing_charges (
    organization_id, subscription_id, asaas_payment_id, asaas_subscription_id,
    plan_id, billing_interval, kind, original_amount_cents, discount_amount_cents,
    final_amount_cents, coupon_redemption_id, due_date, paid_at, status, raw_asaas_status, source
  ) values (
    p_organization_id, p_subscription_id, p_asaas_payment_id, p_asaas_subscription_id,
    p_plan_id, p_billing_interval, p_kind, p_original_amount_cents, p_discount_amount_cents,
    p_final_amount_cents, p_coupon_redemption_id, p_due_date, p_paid_at, p_status, p_raw_asaas_status, p_source
  )
  on conflict (asaas_payment_id) do update set
    subscription_id = coalesce(excluded.subscription_id, billing_charges.subscription_id),
    asaas_subscription_id = coalesce(excluded.asaas_subscription_id, billing_charges.asaas_subscription_id),
    plan_id = coalesce(excluded.plan_id, billing_charges.plan_id),
    billing_interval = coalesce(excluded.billing_interval, billing_charges.billing_interval),
    original_amount_cents = coalesce(excluded.original_amount_cents, billing_charges.original_amount_cents),
    discount_amount_cents = coalesce(excluded.discount_amount_cents, billing_charges.discount_amount_cents),
    final_amount_cents = excluded.final_amount_cents,
    coupon_redemption_id = coalesce(excluded.coupon_redemption_id, billing_charges.coupon_redemption_id),
    due_date = excluded.due_date,
    paid_at = coalesce(excluded.paid_at, billing_charges.paid_at),
    status = excluded.status,
    raw_asaas_status = excluded.raw_asaas_status,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.upsert_billing_charge_system(uuid, uuid, text, text, text, billing_interval, text, bigint, bigint, bigint, uuid, date, timestamptz, text, text, text) from public;
grant execute on function public.upsert_billing_charge_system(uuid, uuid, text, text, text, billing_interval, text, bigint, bigint, bigint, uuid, date, timestamptz, text, text, text) to authenticated;
