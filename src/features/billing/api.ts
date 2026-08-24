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

export async function startCheckout(organizationId: string, planId: string, billingInterval: 'monthly' | 'yearly', cpfCnpj: string) {
  const headers = await authHeader()
  const res = await fetch(`${FUNCTIONS_URL}/billing-create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ organizationId, planId, billingInterval, cpfCnpj }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível iniciar o checkout.')
  return body as { invoiceUrl: string | null; asaasCustomerId: string; asaasSubscriptionId: string }
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
