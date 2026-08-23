import type { Enums, Tables } from '@/types/database'

export type StrategyRecommendationType = Enums<'strategy_recommendation_type'>
export type StrategyRecommendationStatus = Enums<'strategy_recommendation_status'>
export type StrategyExperimentStatus = Enums<'strategy_experiment_status'>

export type StrategyRecommendationRow = Tables<'strategy_recommendations'>
export type StrategyExperimentRow = Tables<'strategy_experiments'>

export const RECOMMENDATION_TYPE_LABEL: Record<StrategyRecommendationType, string> = {
  settings_change: 'Alteração de configuração',
  experiment_suggestion: 'Sugestão de experimento',
  informational: 'Informativo',
}

export const EXPERIMENT_STATUS_LABEL: Record<StrategyExperimentStatus, string> = {
  draft: 'Rascunho',
  active: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  inconclusive: 'Inconclusivo',
}

export const TARGET_LABEL: Record<string, string> = {
  editorial_mix: 'Mix editorial',
  format_mix: 'Mix de formato',
  preferred_times: 'Horários preferidos',
  allowed_weekdays: 'Dias da semana',
  max_radar_per_window: 'Limite de conteúdos do Radar por janela',
}
