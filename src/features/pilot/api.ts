import { supabase } from '@/lib/supabase/client'
import { BillingError, isBillingError, mapBillingError } from '@/lib/billingErrors'
import type { PilotEditorialRole, PilotPlanItemRow, PilotPlanRow, PilotRunRow, PilotSettingsInput, PilotSettingsRow } from '@/features/pilot/types'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return { Authorization: `Bearer ${token}` }
}

export async function fetchPilotSettings(workspaceId: string): Promise<PilotSettingsRow | null> {
  const { data, error } = await supabase.from('pilot_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw error
  return data
}

export async function upsertPilotSettings(workspaceId: string, input: PilotSettingsInput): Promise<PilotSettingsRow> {
  const { data, error } = await supabase.rpc('upsert_pilot_settings', {
    p_workspace_id: workspaceId,
    p_mode: input.mode,
    p_planning_window_days: input.planningWindowDays,
    p_max_posts_per_window: input.maxPostsPerWindow,
    p_allowed_weekdays: input.allowedWeekdays,
    p_preferred_times: input.preferredTimes,
    p_allowed_formats: input.allowedFormats,
    p_editorial_mix: input.editorialMix,
    p_use_radar: input.useRadar,
    p_max_radar_per_window: input.maxRadarPerWindow,
    p_radar_min_opportunity_score: input.radarMinOpportunityScore,
    p_radar_min_confidence: input.radarMinConfidence,
    // As colunas são nullable no banco (sem DEFAULT no parâmetro da RPC),
    // mas o gerador de tipos do Supabase não infere isso — null é um
    // valor válido para a chamada real via PostgREST.
    p_temporary_objective: input.temporaryObjective,
    p_temporary_objective_expires_at: input.temporaryObjectiveExpiresAt,
    p_default_instagram_account_id: input.defaultInstagramAccountId,
    p_max_credits_per_window: input.maxCreditsPerWindow,
    p_auto_generate_art: input.autoGenerateArt,
    p_always_require_approval: input.alwaysRequireApproval,
  } as never)
  if (error) throw error
  return data
}

export interface ActivationReadiness {
  ready: boolean
  missing: string[]
}

export async function checkPilotActivationReadiness(workspaceId: string): Promise<ActivationReadiness> {
  const { data, error } = await supabase.rpc('check_pilot_activation_readiness', { p_workspace_id: workspaceId })
  if (error) throw error
  return data as unknown as ActivationReadiness
}

export async function activatePilot(workspaceId: string): Promise<PilotSettingsRow> {
  const { data, error } = await supabase.rpc('activate_pilot', { p_workspace_id: workspaceId })
  if (error) throw error
  return data
}

export async function pausePilot(workspaceId: string): Promise<PilotSettingsRow> {
  const { data, error } = await supabase.rpc('pause_pilot', { p_workspace_id: workspaceId })
  if (error) throw error
  return data
}

export async function resumePilot(workspaceId: string): Promise<PilotSettingsRow> {
  const { data, error } = await supabase.rpc('resume_pilot', { p_workspace_id: workspaceId })
  if (error) throw error
  return data
}

export async function disablePilot(workspaceId: string): Promise<PilotSettingsRow> {
  const { data, error } = await supabase.rpc('disable_pilot', { p_workspace_id: workspaceId })
  if (error) throw error
  return data
}

export interface PilotPlanWithItems extends PilotPlanRow {
  pilot_plan_items: PilotPlanItemRow[]
}

export async function fetchCurrentPilotPlan(workspaceId: string): Promise<PilotPlanWithItems | null> {
  const { data, error } = await supabase
    .from('pilot_plans')
    .select('*, pilot_plan_items(*)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as unknown as PilotPlanWithItems | null
}

export async function fetchLatestPilotRuns(workspaceId: string, limit = 5): Promise<PilotRunRow[]> {
  const { data, error } = await supabase.from('pilot_runs').select('*').eq('workspace_id', workspaceId).order('started_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<any> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const responseBody = await res.json()
  if (!res.ok) {
    if (isBillingError(res.status, responseBody)) throw new BillingError(mapBillingError(responseBody))
    throw new Error(responseBody.message ?? responseBody.error ?? 'Não foi possível concluir a ação.')
  }
  return responseBody
}

export function generatePilotPlan(workspaceId: string) {
  return callFunction('pilot-plan-generate', { workspaceId })
}

export function generatePilotContent(planId: string) {
  return callFunction('pilot-content-generate', { planId })
}

/** Fase 13 — "Tentar gerar arte novamente" (owner/admin), nunca regenera o texto. */
export function retryPilotVisualAsset(pageId: string) {
  return callFunction('pilot-visual-asset-retry', { pageId })
}

export async function approvePilotPlan(planId: string): Promise<PilotPlanRow> {
  const { data, error } = await supabase.rpc('approve_pilot_plan', { p_plan_id: planId })
  if (error) throw error
  return data
}

export async function cancelPilotPlan(planId: string, reason?: string): Promise<PilotPlanRow> {
  const { data, error } = await supabase.rpc('cancel_pilot_plan', { p_plan_id: planId, p_reason: reason })
  if (error) throw error
  return data
}

export async function editPilotPlanItem(
  itemId: string,
  patch: Partial<{ scheduledFor: string; topic: string; angle: string; format: 'post' | 'carrossel' | 'reel'; editorialRole: PilotEditorialRole; brandPillar: string; objective: string }>,
): Promise<PilotPlanItemRow> {
  const { data, error } = await supabase.rpc('edit_pilot_plan_item', {
    p_item_id: itemId,
    p_scheduled_for: patch.scheduledFor,
    p_topic: patch.topic,
    p_angle: patch.angle,
    p_format: patch.format,
    p_editorial_role: patch.editorialRole,
    p_brand_pillar: patch.brandPillar,
    p_objective: patch.objective,
  })
  if (error) throw error
  return data
}

export async function skipPilotPlanItem(itemId: string, reason?: string): Promise<PilotPlanItemRow> {
  const { data, error } = await supabase.rpc('skip_pilot_plan_item', { p_item_id: itemId, p_reason: reason })
  if (error) throw error
  return data
}

export async function addPilotPlanItem(
  planId: string,
  input: { scheduledFor: string; topic: string; format: 'post' | 'carrossel' | 'reel'; editorialRole: PilotEditorialRole; brandPillar?: string; objective?: string; angle?: string },
): Promise<PilotPlanItemRow> {
  const { data, error } = await supabase.rpc('add_pilot_plan_item', {
    p_plan_id: planId,
    p_scheduled_for: input.scheduledFor,
    p_topic: input.topic,
    p_format: input.format,
    p_editorial_role: input.editorialRole,
    p_brand_pillar: input.brandPillar,
    p_objective: input.objective,
    p_angle: input.angle,
  })
  if (error) throw error
  return data
}
