import { supabase } from '@/lib/supabase/client'

// Toda checagem de autorização real acontece no servidor (RPCs
// SECURITY DEFINER que chamam _require_platform_admin()). Estas funções
// só encaminham a chamada.

export interface FinancialSummary {
  period_start: string
  period_end: string
  issued_cents: number
  has_issued_data: boolean
  received_cents: number
  receivable_cents: number
  overdue_cents: number
  projected_cents: number
}

export async function fetchFinancialSummary(periodStart: string, periodEnd: string): Promise<FinancialSummary> {
  const { data, error } = await supabase.rpc('admin_financial_summary_system', { p_period_start: periodStart, p_period_end: periodEnd })
  if (error) throw error
  return data as unknown as FinancialSummary
}

export interface RecurringRevenue {
  mrr_cents: number
  arr_cents: number
  paying_customers: number
  average_ticket_cents: number
}

export async function fetchRecurringRevenue(): Promise<RecurringRevenue> {
  const { data, error } = await supabase.rpc('admin_recurring_revenue_system')
  if (error) throw error
  return data as unknown as RecurringRevenue
}

export interface RevenueByMonthPoint {
  month: string
  received_cents: number
  issued_cents: number
}

export async function fetchRevenueByMonth(months: number): Promise<RevenueByMonthPoint[]> {
  const { data, error } = await supabase.rpc('admin_revenue_by_month_system', { p_months: months })
  if (error) throw error
  return data as unknown as RevenueByMonthPoint[]
}

export interface RevenueProjectionPoint {
  month: string
  projected_cents: number
}

export async function fetchRevenueProjection(months: number): Promise<RevenueProjectionPoint[]> {
  const { data, error } = await supabase.rpc('admin_revenue_projection_system', { p_months: months })
  if (error) throw error
  return data as unknown as RevenueProjectionPoint[]
}

export interface RevenueByPlan {
  plan_id: string
  plan_name: string
  active_customers: number
  mrr_cents: number
  share_pct: number
  mrr_monthly_cents: number
  mrr_yearly_cents: number
  customers_monthly: number
  customers_yearly: number
}

export async function fetchRevenueByPlan(): Promise<RevenueByPlan[]> {
  const { data, error } = await supabase.rpc('admin_revenue_by_plan_system')
  if (error) throw error
  return data as unknown as RevenueByPlan[]
}

export interface DiscountsSummary {
  gross_cents: number
  discount_cents: number
  net_cents: number
  discount_first_payment_cents: number
  discount_recurring_cents: number
}

export async function fetchDiscountsSummary(periodStart: string, periodEnd: string): Promise<DiscountsSummary> {
  const { data, error } = await supabase.rpc('admin_discounts_summary_system', { p_period_start: periodStart, p_period_end: periodEnd })
  if (error) throw error
  return data as unknown as DiscountsSummary
}

export interface UpcomingReceivables {
  items: { organization_id: string; organization_name: string; due_date: string; amount_cents: number; status: string }[]
  by_month: { month: string; cents: number }[]
}

export async function fetchUpcomingReceivables(days: number): Promise<UpcomingReceivables> {
  const { data, error } = await supabase.rpc('admin_upcoming_receivables_system', { p_days: days })
  if (error) throw error
  return data as unknown as UpcomingReceivables
}

export interface RevenueLost {
  mrr_cancelled_in_period_cents: number
  mrr_at_risk_past_due_cents: number
  note: string
}

export async function fetchRevenueLost(periodStart: string, periodEnd: string): Promise<RevenueLost> {
  const { data, error } = await supabase.rpc('admin_revenue_lost_system', { p_period_start: periodStart, p_period_end: periodEnd })
  if (error) throw error
  return data as unknown as RevenueLost
}

export type ChargeStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'

export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
}

export const CHARGE_STATUS_COLOR: Record<ChargeStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  refunded: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
}

export interface BillingChargeRow {
  id: string
  organization_id: string
  organization_name: string
  owner_email: string
  plan_name: string | null
  billing_interval: 'monthly' | 'yearly' | null
  original_amount_cents: number | null
  discount_amount_cents: number | null
  final_amount_cents: number
  due_date: string
  paid_at: string | null
  status: ChargeStatus
  kind: 'recurring' | 'upgrade'
}

export interface BillingChargeFilters {
  status?: ChargeStatus | ''
  search?: string
  periodStart?: string
  periodEnd?: string
}

export async function fetchBillingCharges(filters: BillingChargeFilters, limit = 25, offset = 0) {
  const { data, error } = await supabase.rpc('admin_list_billing_charges_system', {
    p_status: filters.status || undefined,
    p_search: filters.search || undefined,
    p_period_start: filters.periodStart || undefined,
    p_period_end: filters.periodEnd || undefined,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data as unknown as { total: number; items: BillingChargeRow[] }
}

export interface BackfillSummary {
  organizations_scanned: number
  payments_imported: number
  payments_updated: number
  payments_skipped: number
  unassociated: { asaas_payment_id: string; reason: string }[]
  errors: { organization_id: string; message: string }[]
}

export async function runBillingBackfill(): Promise<BackfillSummary> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada.')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-backfill-billing-charges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error === 'forbidden' ? 'Acesso negado.' : body.error === 'asaas_not_configured' ? 'Asaas não configurado.' : 'Não foi possível executar a sincronização.')
  return body.summary as BackfillSummary
}
