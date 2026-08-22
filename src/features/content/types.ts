import type { Enums, Tables } from '@/types/database'

export type ContentRow = Tables<'contents'>
export type ContentStatus = Enums<'content_status'>
export type ContentType = Enums<'content_type'>
export type ContentFormat = Enums<'content_format'>
export type ContentOrigin = Enums<'content_origin'>

export type ViewMode = 'lista' | 'grade' | 'calendario'

export const STATUS_LABEL: Record<ContentStatus, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  rejeitado: 'Rejeitado',
  aprovado: 'Aprovado',
  agendado: 'Agendado',
  publicando: 'Publicando',
  publicado: 'Publicado',
  falhou: 'Falhou',
}

export const STATUS_BADGE_VARIANT: Record<ContentStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  rascunho: 'neutral',
  em_revisao: 'warning',
  rejeitado: 'danger',
  aprovado: 'brand',
  agendado: 'brand',
  publicando: 'warning',
  publicado: 'success',
  falhou: 'danger',
}

export const TYPE_LABEL: Record<ContentType, string> = {
  post: 'Post',
  carrossel: 'Carrossel',
  reel: 'Reel',
}

export const TYPE_ICON: Record<ContentType, string> = {
  post: '🖼️',
  carrossel: '📚',
  reel: '🎬',
}

export const ORIGIN_LABEL: Record<ContentOrigin, string> = {
  manual: 'Manual',
  ia: 'IA',
  radar: 'Radar',
  autopilot: 'Piloto Automático',
}

export const ORIGIN_ICON: Record<ContentOrigin, string> = {
  manual: '✍️',
  ia: '✨',
  radar: '🔥',
  autopilot: '🤖',
}

export const DEFAULT_FORMAT_BY_TYPE: Record<ContentType, ContentFormat> = {
  post: '4:5',
  carrossel: '4:5',
  reel: '9:16',
}

export const PAGE_DIMENSIONS_BY_FORMAT: Record<ContentFormat, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
}

export interface ContentFilters {
  search: string
  status: ContentStatus | 'todos'
  type: ContentType | 'todos'
  origin: ContentOrigin | 'todos'
  period: 'todos' | 'hoje' | '7dias' | '30dias' | 'personalizado'
  periodStart?: string
  periodEnd?: string
}

export const DEFAULT_FILTERS: ContentFilters = {
  search: '',
  status: 'todos',
  type: 'todos',
  origin: 'todos',
  period: 'todos',
}
