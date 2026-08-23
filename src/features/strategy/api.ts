import { supabase } from '@/lib/supabase/client'
import type { StrategyExperimentRow, StrategyRecommendationRow } from '@/features/strategy/types'

export async function fetchActiveRecommendations(workspaceId: string): Promise<StrategyRecommendationRow[]> {
  const { data, error } = await supabase
    .from('strategy_recommendations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'proposed')
    .order('priority_score', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchRecommendationHistory(workspaceId: string, limit = 20): Promise<StrategyRecommendationRow[]> {
  const { data, error } = await supabase
    .from('strategy_recommendations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['accepted', 'reverted'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function applyRecommendation(recommendationId: string): Promise<StrategyRecommendationRow> {
  const { data, error } = await supabase.rpc('apply_strategy_recommendation', { p_recommendation_id: recommendationId })
  if (error) throw error
  return data
}

export async function revertRecommendation(recommendationId: string): Promise<StrategyRecommendationRow> {
  const { data, error } = await supabase.rpc('revert_strategy_recommendation', { p_recommendation_id: recommendationId })
  if (error) throw error
  return data
}

export async function dismissRecommendation(recommendationId: string, reason?: string): Promise<StrategyRecommendationRow> {
  const { data, error } = await supabase.rpc('dismiss_strategy_recommendation', { p_recommendation_id: recommendationId, p_reason: reason })
  if (error) throw error
  return data
}

export async function fetchActiveExperiment(workspaceId: string): Promise<StrategyExperimentRow | null> {
  const { data, error } = await supabase
    .from('strategy_experiments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['draft', 'active'])
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchExperiment(experimentId: string): Promise<StrategyExperimentRow | null> {
  const { data, error } = await supabase.from('strategy_experiments').select('*').eq('id', experimentId).maybeSingle()
  if (error) throw error
  return data
}

export interface StartExperimentInput {
  workspaceId: string
  hypothesis: string
  dimension: string
  variant: Record<string, string>
  periodDays?: number
  targetSampleSize?: number
  successThresholdPct?: number
  recommendationId?: string
}

export async function startExperiment(input: StartExperimentInput): Promise<StrategyExperimentRow> {
  const { data, error } = await supabase.rpc('start_strategy_experiment', {
    p_workspace_id: input.workspaceId,
    p_hypothesis: input.hypothesis,
    p_dimension: input.dimension,
    p_variant: input.variant,
    p_period_days: input.periodDays ?? 14,
    p_target_sample_size: input.targetSampleSize ?? 2,
    p_success_threshold_pct: input.successThresholdPct ?? 15,
    p_recommendation_id: input.recommendationId,
  })
  if (error) throw error
  return data
}

export async function cancelExperiment(experimentId: string, reason?: string): Promise<StrategyExperimentRow> {
  const { data, error } = await supabase.rpc('cancel_strategy_experiment', { p_experiment_id: experimentId, p_reason: reason })
  if (error) throw error
  return data
}

export async function refreshExperimentResult(experimentId: string): Promise<StrategyExperimentRow> {
  const { data, error } = await supabase.rpc('compute_experiment_result', { p_experiment_id: experimentId })
  if (error) throw error
  return data
}
