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
  show_on_landing: boolean
  landing_label: string | null
}

export async function setAdminCouponLandingFeatured(couponId: string, featured: boolean, label: string | null) {
  const { data, error } = await supabase.rpc('admin_set_coupon_landing_featured_system', {
    p_coupon_id: couponId,
    p_featured: featured,
    p_label: label ?? undefined,
  })
  if (error) throw error
  return data
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

// ── Clientes & Leads ──────────────────────────────────────────────

export type CommercialStatus =
  | 'trial_active'
  | 'trial_not_converted'
  | 'active_customer'
  | 'past_due'
  | 'expired_involuntary'
  | 'cancelled'
  | 'no_subscription'

export const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  trial_active: 'Trial ativo',
  trial_not_converted: 'Trial não convertido',
  active_customer: 'Cliente ativo',
  past_due: 'Inadimplente',
  expired_involuntary: 'Expirado por inadimplência',
  cancelled: 'Cancelado',
  no_subscription: 'Cadastrado (sem trial)',
}

export const COMMERCIAL_STATUS_COLOR: Record<CommercialStatus, string> = {
  trial_active: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  trial_not_converted: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  active_customer: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  past_due: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  expired_involuntary: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  no_subscription: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
}

export interface AdminLeadRow {
  organization_id: string
  workspace_id: string | null
  owner_user_id: string
  full_name: string | null
  email: string
  whatsapp: string | null
  instagram: string | null
  company_name: string | null
  plan_id: string | null
  plan_name: string | null
  billing_interval: 'monthly' | 'yearly' | null
  commercial_status: CommercialStatus
  past_due_since: string | null
  created_at: string
  last_activity_at: string | null
  coupon_code_at_signup: string | null
  utm_source: string | null
  utm_campaign: string | null
  marketing_email_opt_in: boolean | null
  marketing_whatsapp_opt_in: boolean | null
}

export interface AdminLeadFilters {
  search?: string
  status?: CommercialStatus | ''
  planId?: string
  billingInterval?: 'monthly' | 'yearly' | ''
  signupFrom?: string
  signupTo?: string
  couponCode?: string
  utmSource?: string
  utmCampaign?: string
  marketingEmail?: boolean | null
  marketingWhatsapp?: boolean | null
  inactiveDays?: number
  includeDeleted?: boolean
}

export async function fetchAdminLeads(filters: AdminLeadFilters, limit = 25, offset = 0) {
  const { data, error } = await supabase.rpc('admin_list_leads_system', {
    p_search: filters.search || undefined,
    p_status: filters.status || undefined,
    p_plan_id: filters.planId || undefined,
    p_billing_interval: filters.billingInterval || undefined,
    p_signup_from: filters.signupFrom || undefined,
    p_signup_to: filters.signupTo || undefined,
    p_coupon_code: filters.couponCode || undefined,
    p_utm_source: filters.utmSource || undefined,
    p_utm_campaign: filters.utmCampaign || undefined,
    p_marketing_email: filters.marketingEmail ?? undefined,
    p_marketing_whatsapp: filters.marketingWhatsapp ?? undefined,
    p_inactive_days: filters.inactiveDays ?? undefined,
    p_include_deleted: filters.includeDeleted ?? false,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data as unknown as { total: number; items: AdminLeadRow[] }
}

export interface AdminLeadMetrics {
  total_leads: number
  trial_active: number
  trial_not_converted: number
  active_customers: number
  past_due: number
  expired_involuntary: number
  cancelled: number
  trial_to_customer_conversion_pct: number
  mrr_gross_cents: number
  mrr_recurring_discount_cents: number
  funnel: { signups: number; trials: number; paid_customers: number }
}

export async function fetchAdminLeadMetrics() {
  const { data, error } = await supabase.rpc('admin_lead_metrics_system')
  if (error) throw error
  return data as unknown as AdminLeadMetrics
}

export interface AdminLeadDetail {
  identification: {
    organization_id: string
    owner_user_id: string
    full_name: string | null
    email: string
    whatsapp: string | null
    company_name: string | null
    instagram: string | null
    signed_up_at: string
    email_confirmed_at: string | null
    last_sign_in_at: string | null
    deleted_at: string | null
  }
  commercial_status: CommercialStatus
  subscription: {
    plan_id: string | null
    plan_name: string | null
    billing_interval: 'monthly' | 'yearly' | null
    status: string | null
    trial_ends_at: string | null
    activated_at: string | null
    current_period_start: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean | null
    past_due_since: string | null
    price_monthly_cents: number | null
    price_yearly_cents: number | null
  }
  journey: { from_status: string | null; to_status: string; reason: string | null; created_at: string }[]
  financial: {
    coupon_code: string
    original_amount_cents: number
    discount_amount_cents: number
    final_amount_cents: number
    status: string
    created_at: string
  }[]
  attribution: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
    utm_term: string | null
    coupon_code_at_signup: string | null
    captured_at: string
  } | null
  product: {
    workspace_id: string | null
    credits_balance: number | null
    dna_completed: boolean
    instagram_connected: boolean
    contents_count: number
    last_activity_at: string | null
  }
  marketing_consent: {
    email: { opted_in: boolean; changed_at: string; source: string } | null
    whatsapp: { opted_in: boolean; changed_at: string; source: string } | null
  }
  notes: { id: string; body: string; author_email: string; created_at: string }[]
  tags: string[]
  follow_ups: {
    id: string
    action_type: string
    due_at: string | null
    note: string | null
    status: 'open' | 'done'
    created_at: string
    completed_at: string | null
  }[]
}

export async function fetchAdminLeadDetail(organizationId: string) {
  const { data, error } = await supabase.rpc('admin_get_lead_detail_system', { p_organization_id: organizationId })
  if (error) throw error
  return data as unknown as AdminLeadDetail
}

export async function addAdminLeadNote(organizationId: string, body: string) {
  const { data, error } = await supabase.rpc('admin_add_lead_note_system', { p_organization_id: organizationId, p_body: body })
  if (error) throw error
  return data
}

export async function setAdminLeadTags(organizationId: string, tags: string[]) {
  const { data, error } = await supabase.rpc('admin_set_lead_tags_system', { p_organization_id: organizationId, p_tags: tags })
  if (error) throw error
  return data
}

export const FOLLOW_UP_ACTION_LABEL: Record<string, string> = {
  contact: 'Entrar em contato',
  proposal: 'Enviar proposta',
  recover_trial: 'Recuperar trial',
  billing: 'Cobrança',
  other: 'Outro',
}

export async function addAdminLeadFollowUp(organizationId: string, actionType: string, dueAt: string | null, note: string | null) {
  // IMPORTANTE: nunca usar `?? undefined` aqui. O PostgREST resolve a
  // função pelo conjunto exato de parâmetros nomeados enviados no corpo —
  // um valor `undefined` é removido pelo JSON.stringify antes de sair,
  // então omitir p_due_at (mesmo tendo DEFAULT null no Postgres) faz o
  // PostgREST não encontrar a função (PGRST202: "no matches found").
  // `null` é um valor JSON válido e mantém o parâmetro presente — sempre
  // enviar null explicitamente em vez de omitir.
  const { data, error } = await supabase.rpc('admin_add_lead_follow_up_system', {
    p_organization_id: organizationId,
    p_action_type: actionType,
    p_due_at: dueAt,
    p_note: note,
  } as never)
  if (error) throw error
  return data
}

export async function completeAdminLeadFollowUp(followUpId: string) {
  const { data, error } = await supabase.rpc('admin_complete_lead_follow_up_system', { p_follow_up_id: followUpId })
  if (error) throw error
  return data
}

export async function exportAdminLeadsCsv(filters: AdminLeadFilters): Promise<Blob> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada.')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-export-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      search: filters.search || undefined,
      status: filters.status || undefined,
      planId: filters.planId || undefined,
      billingInterval: filters.billingInterval || undefined,
      signupFrom: filters.signupFrom || undefined,
      signupTo: filters.signupTo || undefined,
      couponCode: filters.couponCode || undefined,
      utmSource: filters.utmSource || undefined,
      utmCampaign: filters.utmCampaign || undefined,
      marketingEmail: filters.marketingEmail ?? undefined,
      marketingWhatsapp: filters.marketingWhatsapp ?? undefined,
      inactiveDays: filters.inactiveDays ?? undefined,
      includeDeleted: filters.includeDeleted ?? false,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error === 'forbidden' ? 'Acesso negado.' : 'Não foi possível gerar a exportação.')
  }
  return res.blob()
}
