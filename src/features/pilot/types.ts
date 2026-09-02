import type { Enums, Tables } from '@/types/database'

export type PilotSettingsRow = Tables<'pilot_settings'>
export type PilotPlanRow = Tables<'pilot_plans'>
export type PilotPlanItemRow = Tables<'pilot_plan_items'>
export type PilotRunRow = Tables<'pilot_runs'>
export type PilotStatus = Enums<'pilot_status'>
export type PilotMode = Enums<'pilot_mode'>
export type PilotPlanStatus = Enums<'pilot_plan_status'>
export type PilotPlanItemStatus = Enums<'pilot_plan_item_status'>
export type PilotEditorialRole = Enums<'pilot_editorial_role'>

export const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Bloco 10: agenda semanal exibida Segunda→Domingo — mapeia pra weekday 0=domingo..6=sábado já usado no banco/Radar-plan-generate. */
export const WEEKDAY_ORDER_MON_FIRST: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Segunda' },
  { weekday: 2, label: 'Terça' },
  { weekday: 3, label: 'Quarta' },
  { weekday: 4, label: 'Quinta' },
  { weekday: 5, label: 'Sexta' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
]

export const EDITORIAL_ROLE_LABEL: Record<PilotEditorialRole, string> = {
  educativo: 'Educativo',
  autoridade: 'Autoridade',
  relacionamento: 'Relacionamento',
  venda: 'Venda',
}

export const PLAN_STATUS_LABEL: Record<PilotPlanStatus, string> = {
  draft: 'Rascunho',
  awaiting_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  generating: 'Gerando conteúdo',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export const ITEM_STATUS_LABEL: Record<PilotPlanItemStatus, string> = {
  planned: 'Planejado',
  approved: 'Aprovado',
  generating: 'Gerando…',
  generated: 'Conteúdo criado',
  skipped: 'Removido',
  failed: 'Falhou',
}

export interface PilotSettingsInput {
  mode: PilotMode
  planningWindowDays: number
  maxPostsPerWindow: number
  allowedWeekdays: number[]
  preferredTimes: { default: string; overrides?: Record<string, string> }
  allowedFormats: ('post' | 'carrossel')[]
  editorialMix: Record<string, number>
  useRadar: boolean
  maxRadarPerWindow: number
  radarMinOpportunityScore: number
  radarMinConfidence: 'medium' | 'high'
  temporaryObjective: string | null
  temporaryObjectiveExpiresAt: string | null
  defaultInstagramAccountId: string | null
  maxCreditsPerWindow: number | null
  autoGenerateArt: boolean
  alwaysRequireApproval: boolean
}
