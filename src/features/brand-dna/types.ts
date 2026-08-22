import type { Tables } from '@/types/database'

export type BrandProfileRow = Tables<'brand_profiles'>

export type ContentFormat = 'post' | 'carrossel' | 'reels' | 'story'
export type ContentObjective =
  | 'vender'
  | 'educar'
  | 'autoridade'
  | 'relacionamento'
  | 'leads'
  | 'alcance'
  | 'engajamento'
  | 'divulgar'
export type KnowledgeLevel = 'iniciante' | 'intermediario' | 'avancado'
export type UsageIntensity = 'nenhum' | 'pouco' | 'moderado' | 'muito'

export interface AudienceSection {
  age_range: string
  gender: string
  location: string
  interests: string[]
  needs: string[]
  pains: string[]
  desires: string[]
  objections: string[]
  buying_behavior: string
  knowledge_level: KnowledgeLevel | ''
}

export interface ContentStrategySection {
  priority_themes: string[]
  secondary_themes: string[]
  preferred_formats: ContentFormat[]
  objectives: ContentObjective[]
  topics_to_cover: string[]
  topics_to_avoid: string[]
}

export interface VoiceSection {
  formality: number
  tone: number
  complexity: number
  personal_institutional: number
  personality_traits: string[]
}

export interface VocabularySection {
  preferred_words: string[]
  forbidden_words: string[]
  preferred_cta: string
  emoji_usage: UsageIntensity
  hashtag_usage: UsageIntensity
  hashtag_style: string
  signature_expressions: string[]
}

export interface VisualIdentitySection {
  colors: string[]
  typography: string
  visual_style: string
  references: string[]
}

export const EMPTY_AUDIENCE: AudienceSection = {
  age_range: '',
  gender: '',
  location: '',
  interests: [],
  needs: [],
  pains: [],
  desires: [],
  objections: [],
  buying_behavior: '',
  knowledge_level: '',
}

export const EMPTY_CONTENT_STRATEGY: ContentStrategySection = {
  priority_themes: [],
  secondary_themes: [],
  preferred_formats: [],
  objectives: [],
  topics_to_cover: [],
  topics_to_avoid: [],
}

export const EMPTY_VOICE: VoiceSection = {
  formality: 50,
  tone: 50,
  complexity: 50,
  personal_institutional: 50,
  personality_traits: [],
}

export const EMPTY_VOCABULARY: VocabularySection = {
  preferred_words: [],
  forbidden_words: [],
  preferred_cta: '',
  emoji_usage: 'moderado',
  hashtag_usage: 'moderado',
  hashtag_style: '',
  signature_expressions: [],
}

export const EMPTY_VISUAL_IDENTITY: VisualIdentitySection = {
  colors: [],
  typography: '',
  visual_style: '',
  references: [],
}

export const PERSONALITY_TRAITS = [
  'Autoridade',
  'Inspiradora',
  'Educativa',
  'Divertida',
  'Elegante',
  'Próxima',
  'Ousada',
  'Profissional',
  'Acolhedora',
  'Motivacional',
] as const

export const CONTENT_FORMATS: { value: ContentFormat; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'reels', label: 'Reels' },
  { value: 'story', label: 'Story' },
]

export const CONTENT_OBJECTIVES: { value: ContentObjective; label: string }[] = [
  { value: 'vender', label: 'Vender' },
  { value: 'educar', label: 'Educar' },
  { value: 'autoridade', label: 'Gerar autoridade' },
  { value: 'relacionamento', label: 'Gerar relacionamento' },
  { value: 'leads', label: 'Gerar leads' },
  { value: 'alcance', label: 'Aumentar alcance' },
  { value: 'engajamento', label: 'Gerar engajamento' },
  { value: 'divulgar', label: 'Divulgar produto/serviço' },
]
