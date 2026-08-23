import type { Enums, Tables } from '@/types/database'

export type ContentFormat = Enums<'content_type'>
export type PerformanceSnapshotStatus = Enums<'performance_snapshot_status'>
export type PerformanceMaturityStage = Enums<'performance_maturity_stage'>
export type PerformanceBaselineTier = Enums<'performance_baseline_tier'>
export type PerformanceBaselineScope = Enums<'performance_baseline_scope'>
export type PerformanceConfidence = Enums<'performance_confidence'>
export type PerformanceInsightStatus = Enums<'performance_insight_status'>
export type PerformanceInsightSource = Enums<'performance_insight_source'>
export type PerformanceInsightFeedback = Enums<'performance_insight_feedback'>
export type InstagramInsightsStatus = Enums<'instagram_insights_status'>

export type ContentPerformanceSnapshotRow = Tables<'content_performance_snapshots'>
export type ContentPerformanceScoreRow = Tables<'content_performance_scores'>
export type PerformanceInsightRow = Tables<'performance_insights'>

export interface PerformanceFacts {
  workspace_id: string
  period_start: string
  period_end: string
  previous_period_start: string
  previous_period_end: string
  overall: { avg_score: number | null; avg_score_previous: number | null; avg_relative_reach: number | null; avg_relative_engagement: number | null; sample_size: number; sample_size_previous: number }
  by_format: Array<{ format: string; avg_score: number; sample_size: number }>
  by_origin: Array<{ origin: string; avg_score: number; sample_size: number }>
  by_editorial_role: Array<{ editorial_role: string; avg_score: number; sample_size: number }>
  by_hour: Array<{ hour: number; avg_score: number; sample_size: number }>
  best_format: { format: string; avg_score: number; sample_size: number } | null
  best_editorial_role: { editorial_role: string; avg_score: number; sample_size: number } | null
  best_origin: { origin: string; avg_score: number; sample_size: number } | null
  min_sample_provisional: number
}

export interface ContentPerformanceCard {
  content_id: string
  instagram_publication_id: string
  title: string
  format: ContentFormat
  published_at: string | null
  permalink: string | null
  origin: string
  score: ContentPerformanceScoreRow | null
  latest_snapshot: ContentPerformanceSnapshotRow | null
}

export const BASELINE_TIER_LABEL: Record<PerformanceBaselineTier, string> = {
  collecting_data: 'Coletando dados',
  baseline_provisional: 'Baseline provisório',
  baseline_ready: 'Baseline pronto',
}

export const MATURITY_LABEL: Record<PerformanceMaturityStage, string> = {
  initial: 'Inicial',
  evolving: 'Em evolução',
  consolidated: 'Consolidada',
}

export const CONFIDENCE_LABEL: Record<PerformanceConfidence, string> = {
  low: 'Confiança baixa',
  medium: 'Confiança média',
  high: 'Confiança alta',
}

export const INSIGHTS_STATUS_LABEL: Record<InstagramInsightsStatus, string> = {
  not_connected: 'Instagram não conectado',
  permission_required: 'Reconecte o Instagram para liberar métricas',
  available: 'Métricas disponíveis',
  not_supported: 'Métricas não suportadas para esta conta',
}

export function badgeForScore(score: number | null): { label: string; tone: 'above' | 'average' | 'below' | 'none' } {
  if (score == null) return { label: 'Sem score ainda', tone: 'none' }
  if (score >= 60) return { label: 'Acima da média', tone: 'above' }
  if (score >= 40) return { label: 'Na média', tone: 'average' }
  return { label: 'Abaixo da média', tone: 'below' }
}
