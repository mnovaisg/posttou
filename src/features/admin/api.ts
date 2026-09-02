import { supabase } from '@/lib/supabase/client'

// Toda checagem de autorização real acontece no servidor (RPCs
// SECURITY DEFINER que chamam _require_platform_admin() e lêem
// platform_admins, nunca papel de workspace). Estas funções aqui só
// encaminham a chamada — nunca decidem quem é admin no cliente.

export async function checkIsPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return !!data
}

export type CouponDerivedStatus = 'active' | 'inactive' | 'expired' | 'scheduled' | 'limit_reached'

export interface AdminCoupon {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  duration: 'first_payment' | 'recurring'
  eligible_plan_ids: string[] | null
  eligible_billing_intervals: ('monthly' | 'yearly')[] | null
  starts_at: string | null
  expires_at: string | null
  max_redemptions: number | null
  max_redemptions_per_organization: number
  active: boolean
  created_at: string
  updated_at: string
  used_count: number
  derived_status: CouponDerivedStatus
}

export async function fetchAdminDashboardMetrics() {
  const { data, error } = await supabase.rpc('admin_dashboard_metrics_system')
  if (error) throw error
  return data as unknown as {
    active_coupons: number
    expired_coupons: number
    total_redemptions: number
    total_discount_granted_cents: number
    subscriptions_originated_with_coupon: number
  }
}

export async function fetchAdminCoupons(search: string, status: string, limit = 50, offset = 0) {
  const { data, error } = await supabase.rpc('admin_list_coupons_system', {
    p_search: search || undefined,
    p_status: status || undefined,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data as unknown as { total: number; items: AdminCoupon[] }
}

export interface AdminCouponRedemption {
  id: string
  organization_id: string
  organization_name: string | null
  status: 'reserved' | 'applied' | 'failed'
  original_amount_cents: number
  discount_amount_cents: number
  final_amount_cents: number
  plan_id: string
  billing_interval: 'monthly' | 'yearly'
  failure_reason: string | null
  created_at: string
}

export async function fetchAdminCouponDetail(couponId: string) {
  const { data, error } = await supabase.rpc('admin_get_coupon_detail_system', { p_coupon_id: couponId })
  if (error) throw error
  return data as unknown as { coupon: AdminCoupon; redemptions: AdminCouponRedemption[] }
}

export interface CouponFormInput {
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  duration: 'first_payment' | 'recurring'
  eligiblePlanIds: string[] | null
  eligibleBillingIntervals: ('monthly' | 'yearly')[] | null
  startsAt: string | null
  expiresAt: string | null
  maxRedemptions: number | null
  maxRedemptionsPerOrganization: number
  active: boolean
}

export async function createAdminCoupon(input: CouponFormInput) {
  const { data, error } = await supabase.rpc('admin_create_coupon_system', {
    p_code: input.code,
    p_discount_type: input.discountType,
    p_discount_value: input.discountValue,
    p_duration: input.duration,
    p_eligible_plan_ids: input.eligiblePlanIds ?? undefined,
    p_eligible_billing_intervals: input.eligibleBillingIntervals ?? undefined,
    p_starts_at: input.startsAt ?? undefined,
    p_expires_at: input.expiresAt ?? undefined,
    p_max_redemptions: input.maxRedemptions ?? undefined,
    p_max_redemptions_per_organization: input.maxRedemptionsPerOrganization,
    p_active: input.active,
  })
  if (error) throw error
  return data
}

export async function updateAdminCoupon(couponId: string, input: Omit<CouponFormInput, 'code' | 'active'>) {
  // O gerador de tipos do Supabase marca args sem DEFAULT no Postgres como
  // não-nulos, embora a coluna/tipo real aceite null perfeitamente — por
  // isso o cast aqui, só para contornar essa limitação do gerador.
  const { data, error } = await supabase.rpc('admin_update_coupon_system', {
    p_coupon_id: couponId,
    p_discount_type: input.discountType,
    p_discount_value: input.discountValue,
    p_duration: input.duration,
    p_eligible_plan_ids: input.eligiblePlanIds,
    p_eligible_billing_intervals: input.eligibleBillingIntervals,
    p_starts_at: input.startsAt,
    p_expires_at: input.expiresAt,
    p_max_redemptions: input.maxRedemptions,
    p_max_redemptions_per_organization: input.maxRedemptionsPerOrganization,
  } as never)
  if (error) throw error
  return data
}

export async function setAdminCouponActive(couponId: string, active: boolean) {
  const { data, error } = await supabase.rpc('admin_set_coupon_active_system', { p_coupon_id: couponId, p_active: active })
  if (error) throw error
  return data
}

export async function deleteAdminCoupon(couponId: string) {
  const { error } = await supabase.rpc('admin_delete_coupon_system', { p_coupon_id: couponId })
  if (error) throw error
}
