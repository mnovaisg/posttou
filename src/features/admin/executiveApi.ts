import { supabase } from '@/lib/supabase/client'

// Toda checagem de autorização real acontece no servidor (RPCs
// SECURITY DEFINER que chamam _require_platform_admin()). Estas funções
// só encaminham a chamada.

export interface ExecutiveDashboard {
  health: {
    received_month_cents: number
    mrr_cents: number
    active_customers: number
    trial_active: number
  }
  commercial: {
    new_paid_customers_month: number
    new_signups_month: number
    trial_to_customer_conversion_pct: number
    past_due: number
  }
  goal: {
    month: string
    goal_cents: number | null
    realized_cents: number
    pct: number | null
  }
  revenue_by_month: { month: string; received_cents: number; issued_cents: number }[]
  funnel: {
    signups: number
    trials: number
    dna_completed: number
    instagram_connected: number
    paid_customers: number
    monotonic: boolean
  }
  revenue_by_plan: {
    plan_id: string
    plan_name: string
    active_customers: number
    mrr_cents: number
    share_pct: number
  }[]
  alerts: {
    trials_ending_48h: number
    past_due: number
    follow_ups_due: number
    asaas_sync_issues: number
  }
}

export async function fetchExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const { data, error } = await supabase.rpc('admin_executive_dashboard_system')
  if (error) throw error
  return data as unknown as ExecutiveDashboard
}

export interface RevenueGoal {
  month: string
  goal_cents: number
  created_by: string
  created_at: string
  updated_at: string
}

export async function fetchRevenueGoal(month?: string): Promise<RevenueGoal | null> {
  const { data, error } = await supabase.rpc('admin_get_revenue_goal_system', month ? { p_month: month } : {})
  if (error) throw error
  return (data as unknown as RevenueGoal | null) ?? null
}

export async function setRevenueGoal(month: string, goalCents: number): Promise<RevenueGoal> {
  const { data, error } = await supabase.rpc('admin_set_revenue_goal_system', { p_month: month, p_goal_cents: goalCents })
  if (error) throw error
  return data as unknown as RevenueGoal
}
