import type { Enums, Tables } from '@/types/database'

export type RadarOpportunityRow = Tables<'radar_opportunities'>
export type RadarOpportunityStatus = 'new' | 'saved' | 'used' | 'dismissed' | 'expired'
export type RadarConfidence = 'low' | 'medium' | 'high'
export type ContentType = Enums<'content_type'>

export interface RadarOpportunityWithCluster extends RadarOpportunityRow {
  radar_clusters: {
    id: string
    theme_summary: string
    primary_topic: string | null
    viral_score: number | null
    viral_score_breakdown: Record<string, unknown>
    signal_count: number
    provider_diversity: number
  } | null
}

export const CONFIDENCE_LABEL: Record<RadarConfidence, string> = {
  low: 'Confiança baixa',
  medium: 'Confiança média',
  high: 'Confiança alta',
}

export const STATUS_LABEL: Record<RadarOpportunityStatus, string> = {
  new: 'Nova',
  saved: 'Salva',
  used: 'Transformada em conteúdo',
  dismissed: 'Dispensada',
  expired: 'Expirada',
}
