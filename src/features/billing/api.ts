import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return { Authorization: `Bearer ${token}` }
}

export interface WorkspaceEntitlements {
  allowed: boolean
  reason?: string
  status: string
  plan_id: string
  plan_name: string
  billing_interval: 'monthly' | 'yearly'
  monthly_content_allowance: number
  content_used_this_period: number | null
  content_remaining_this_period: number | null
  franchise_period_start: string
  franchise_period_end: string
  max_workspaces: number
  max_members: number
  trial_ends_at: string | null
  capabilities: Record<string, unknown>
}

export async function fetchWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
  const { data, error } = await supabase.rpc('get_workspace_entitlements', { p_workspace_id: workspaceId })
  if (error) throw error
  return data as unknown as WorkspaceEntitlements
}

export async function fetchPlans(): Promise<Tables<'plans'>[]> {
  const { data, error } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order')
  if (error) throw error
  return data
}

export async function fetchOrganizationWorkspaces(organizationId: string): Promise<Tables<'workspaces'>[]> {
  const { data, error } = await supabase.from('workspaces').select('*').eq('organization_id', organizationId).order('created_at')
  if (error) throw error
  return data
}

export async function createWorkspaceInOrganization(organizationId: string, name: string): Promise<Tables<'workspaces'>> {
  const { data, error } = await supabase.rpc('create_workspace_in_organization', { p_organization_id: organizationId, p_name: name })
  if (error) throw error
  return data
}

export async function startCheckout(
  organizationId: string,
  planId: string,
  billingInterval: 'monthly' | 'yearly',
  cpfCnpj: string,
  couponCode?: string,
) {
  const headers = await authHeader()
  const res = await fetch(`${FUNCTIONS_URL}/billing-create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ organizationId, planId, billingInterval, cpfCnpj, couponCode: couponCode || undefined }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível iniciar o checkout.')
  return body as {
    invoiceUrl: string | null
    asaasCustomerId: string
    asaasSubscriptionId: string
    coupon: { code: string; applied: boolean; originalAmountCents: number; discountAmountCents: number; finalAmountCents: number; duration: 'first_payment' | 'recurring' } | null
  }
}

export interface CouponPreview {
  valid: boolean
  reason?: string
  code?: string
  discountType?: 'percentage' | 'fixed'
  duration?: 'first_payment' | 'recurring'
  originalAmountCents?: number
  discountAmountCents?: number
  finalAmountCents?: number
}

// Só leitura — nunca reserva nem consome o cupom. discount_value nunca
// vem do frontend em lugar nenhum: aqui só mandamos o código, o servidor
// (RPC SECURITY DEFINER) decide tudo, inclusive o valor final.
export async function previewCoupon(organizationId: string, code: string, planId: string, billingInterval: 'monthly' | 'yearly'): Promise<CouponPreview> {
  const { data, error } = await supabase.rpc('preview_coupon', {
    p_organization_id: organizationId,
    p_code: code,
    p_plan_id: planId,
    p_billing_interval: billingInterval,
  })
  if (error) throw error
  return data as unknown as CouponPreview
}

// Variante pública (Landing, pré-cadastro) — ainda não existe
// organização, então não dá pra chamar previewCoupon. Mesma
// infraestrutura de validação/desconto do servidor, mesmo shape de
// retorno; só não avalia os dois critérios que dependem de organização
// (isso é revalidado de verdade no checkout, que é sempre a autoridade
// final — este preview é só prévia).
export async function publicPreviewCoupon(code: string, planId: string, billingInterval: 'monthly' | 'yearly'): Promise<CouponPreview> {
  const { data, error } = await supabase.rpc('public_preview_coupon', {
    p_code: code,
    p_plan_id: planId,
    p_billing_interval: billingInterval,
  })
  if (error) throw error
  return data as unknown as CouponPreview
}

export interface FeaturedCoupon {
  code: string
  landing_label: string | null
  eligible_plan_ids: string[] | null
  eligible_billing_intervals: ('monthly' | 'yearly')[] | null
}

// Anon-callable — retorna só o essencial pra montar o selo (código, rótulo,
// escopo de elegibilidade). Nunca traz desconto/valor: isso a Landing
// sempre busca via publicPreviewCoupon, pra nunca hardcodar número nenhum
// aqui e pra garantir que o selo desaparece sozinho se o cupom deixar de
// valer pra aquele plano/ciclo específico.
export async function fetchFeaturedCoupon(): Promise<FeaturedCoupon | null> {
  const { data, error } = await supabase.rpc('public_featured_coupon_system')
  if (error) throw error
  return (data as unknown as FeaturedCoupon | null) ?? null
}

export const COUPON_REASON_LABEL: Record<string, string> = {
  not_found: 'Cupom não encontrado.',
  invalid_plan: 'Plano inválido.',
  inactive: 'Este cupom não está mais ativo.',
  not_started: 'Este cupom ainda não começou a valer.',
  expired: 'Este cupom expirou.',
  plan_not_eligible: 'Este cupom não é válido para este plano.',
  interval_not_eligible: 'Este cupom não é válido para este ciclo (mensal/anual).',
  already_redeemed_by_organization: 'Sua organização já usou este cupom.',
  max_redemptions_reached: 'Este cupom atingiu o limite de usos.',
}

export async function changePlan(organizationId: string, newPlanId: string, newBillingInterval: 'monthly' | 'yearly') {
  const headers = await authHeader()
  const res = await fetch(`${FUNCTIONS_URL}/billing-change-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ organizationId, newPlanId, newBillingInterval }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível trocar de plano.')
  return body as { kind: 'upgrade' | 'downgrade'; invoiceUrl?: string | null; appliedAtNextCycle?: boolean }
}

export async function cancelSubscription(organizationId: string) {
  const headers = await authHeader()
  const res = await fetch(`${FUNCTIONS_URL}/billing-cancel-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ organizationId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível cancelar a assinatura.')
  return body
}
