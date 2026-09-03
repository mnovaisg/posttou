import { supabase } from '@/lib/supabase/client'

export interface AdminPlan {
  id: string
  name: string
  price_monthly_cents: number
  price_yearly_cents: number
  is_active: boolean
  monthly_content_allowance: number
  max_workspaces: number
  max_members: number
  sort_order: number
  updated_at: string
  last_price_change_at: string | null
  last_name_change_at: string | null
}

export async function fetchAdminPlans(): Promise<AdminPlan[]> {
  const { data, error } = await supabase.rpc('admin_list_plans_system')
  if (error) throw error
  return (data as unknown as AdminPlan[]) ?? []
}

export type RoundingRule = 'exact' | 'integer' | 'commercial_9'
export type PriceChangeType = 'price_manual' | 'price_percent' | 'price_bulk'

export interface PlanPriceChangeItem {
  plan_id: string
  new_monthly_cents: number | null
  new_yearly_cents: number | null
}

export async function applyPlanPriceChanges(
  items: PlanPriceChangeItem[],
  changeType: PriceChangeType,
  percentApplied: number | null,
  roundingRule: RoundingRule | null,
  note: string | null,
) {
  const { data, error } = await supabase.rpc('admin_apply_plan_price_changes_system', {
    p_items: items as unknown as import('@/types/database').Json,
    p_change_type: changeType,
    p_percent_applied: percentApplied ?? undefined,
    p_rounding_rule: roundingRule ?? undefined,
    p_note: note ?? undefined,
  })
  if (error) throw error
  return data as unknown as { batch_id: string; applied: { plan_id: string; field: string }[] }
}

export async function renameAdminPlan(planId: string, newName: string, note: string | null) {
  const { data, error } = await supabase.rpc('admin_rename_plan_system', {
    p_plan_id: planId,
    p_new_name: newName,
    p_note: note ?? undefined,
  })
  if (error) throw error
  return data as unknown as AdminPlan
}

export async function restorePlanChange(historyId: string, note: string | null) {
  const { data, error } = await supabase.rpc('admin_restore_plan_change_system', {
    p_history_id: historyId,
    p_note: note ?? undefined,
  })
  if (error) throw error
  return data as unknown as AdminPlan
}

export interface PlanChangeHistoryRow {
  id: string
  plan_id: string
  change_type: 'price_manual' | 'price_percent' | 'price_bulk' | 'price_restore' | 'rename' | 'rename_restore'
  field: 'monthly' | 'yearly' | 'monthly_and_yearly' | 'name'
  previous_monthly_cents: number | null
  new_monthly_cents: number | null
  previous_yearly_cents: number | null
  new_yearly_cents: number | null
  previous_name: string | null
  new_name: string | null
  percent_applied: number | null
  rounding_rule: RoundingRule | null
  note: string | null
  batch_id: string | null
  restored_from_history_id: string | null
  created_at: string
  admin_user_id: string
  admin_display_name: string | null
}

export async function fetchPlanChangeHistory(planId: string | null, limit = 50, cursor: string | null = null): Promise<PlanChangeHistoryRow[]> {
  const { data, error } = await supabase.rpc('admin_list_plan_change_history_system', {
    p_plan_id: planId ?? undefined,
    p_limit: limit,
    p_cursor: cursor ?? undefined,
  })
  if (error) throw error
  return (data as unknown as PlanChangeHistoryRow[]) ?? []
}

export const CHANGE_TYPE_LABEL: Record<PlanChangeHistoryRow['change_type'], string> = {
  price_manual: 'Edição direta',
  price_percent: 'Ajuste percentual',
  price_bulk: 'Ajuste em massa',
  price_restore: 'Restauração de preço',
  rename: 'Renomeação',
  rename_restore: 'Restauração de nome',
}

export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Regras de arredondamento — nunca aplicadas silenciosamente, sempre
// escolhidas explicitamente pelo admin antes da prévia final.
export function applyRounding(cents: number, rule: RoundingRule): number {
  if (rule === 'exact') return Math.round(cents)
  if (rule === 'integer') return Math.round(cents / 100) * 100
  // commercial_9: leva ao real inteiro mais próximo terminado em 9
  // (ex.: R$118,80 -> R$119; R$238,80 -> R$239).
  const reais = cents / 100
  const nearestEndingIn9 = Math.round((reais - 9) / 10) * 10 + 9
  return Math.round(nearestEndingIn9 * 100)
}
