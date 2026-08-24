import type { ContentFormat, ContentType } from '@/features/content/types'
import type { Tables } from '@/types/database'

export type ElementType = 'text' | 'image' | 'shape'
export type ShapeKind = 'rectangle' | 'circle' | 'line'

export interface TextElementContent {
  text: string
}
export interface TextElementStyle {
  fontSize: number
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  color: string
  opacity: number
  lineHeight: number
  letterSpacing: number
}
export const DEFAULT_TEXT_STYLE: TextElementStyle = {
  fontSize: 48,
  fontFamily: 'Inter',
  fontWeight: 600,
  fontStyle: 'normal',
  textAlign: 'left',
  color: '#111111',
  opacity: 1,
  lineHeight: 1.2,
  letterSpacing: 0,
}

export interface ImageElementContent {
  /** Path no bucket privado content-assets (nunca URL de terceiro). */
  path: string
}
export interface ImageElementStyle {
  opacity: number
}
export const DEFAULT_IMAGE_STYLE: ImageElementStyle = { opacity: 1 }

export interface ShapeElementContent {
  shapeKind: ShapeKind
}
export interface ShapeElementStyle {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}
export const DEFAULT_SHAPE_STYLE: ShapeElementStyle = {
  fill: '#8b5cf6',
  stroke: 'transparent',
  strokeWidth: 0,
  opacity: 1,
}

export type ElementContent = TextElementContent | ImageElementContent | ShapeElementContent
export type ElementStyle = TextElementStyle | ImageElementStyle | ShapeElementStyle

export interface EditorElement {
  id: string
  page_id: string
  type: ElementType
  position_x: number
  position_y: number
  width: number
  height: number
  rotation: number
  z_index: number
  locked: boolean
  hidden: boolean
  content: ElementContent
  style: ElementStyle
  /** true se ainda não existe no banco (id local, precisa INSERT no save). */
  isNew?: boolean
}

export interface EditorPage {
  id: string
  content_id: string
  position: number
  background_color: string
  width: number
  height: number
  elements: EditorElement[]
  isNew?: boolean
  /** Fase 13 — estado da arte automática do Piloto para esta página. */
  visual_asset_status?: 'not_requested' | 'pending' | 'generating' | 'ready' | 'failed'
}

export interface EditorFormatSpec {
  format: ContentFormat
  label: string
  width: number
  height: number
}

export const EDITOR_FORMATS: EditorFormatSpec[] = [
  { format: '1:1', label: 'Post', width: 1080, height: 1080 },
  { format: '4:5', label: 'Post/Carrossel', width: 1080, height: 1350 },
  { format: '9:16', label: 'Story/Reels', width: 1080, height: 1920 },
]

export type ContentRow = Tables<'contents'>

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  post: 'Post',
  carrossel: 'Carrossel',
  reel: 'Reel',
}
