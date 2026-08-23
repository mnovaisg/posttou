import type { Enums } from '@/types/database'

// performance_insight (Fase 10) é gerado só internamente (worker/"Explicar
// melhor" do dashboard de Performance) — nunca aparece no seletor de
// "Criar com IA", então fica de fora deste union.
export type GenerationType = Exclude<Enums<'ai_generation_type'>, 'performance_insight'>

export const GENERATION_TYPE_LABEL: Record<GenerationType, string> = {
  post_unico: 'Post único',
  carrossel: 'Carrossel',
  reels_roteiro: 'Reels (roteiro)',
  legenda: 'Legenda',
  ideias_conteudo: 'Ideias de conteúdo',
  imagem: 'Imagem',
}

export const GENERATION_TYPE_ICON: Record<GenerationType, string> = {
  post_unico: '🖼️',
  carrossel: '📚',
  reels_roteiro: '🎬',
  legenda: '✍️',
  ideias_conteudo: '💡',
  imagem: '🎨',
}

export const GENERATION_TYPE_DESCRIPTION: Record<GenerationType, string> = {
  post_unico: 'Legenda, hashtags e CTA para um post único.',
  carrossel: 'Legenda + texto de cada slide, pronto para editar.',
  reels_roteiro: 'Roteiro (gancho, desenvolvimento, fechamento) + legenda.',
  legenda: 'Só a legenda, hashtags e CTA — você já tem a imagem.',
  imagem: 'Gerada dentro do Editor Visual.',
  ideias_conteudo: 'Uma lista de ideias para não travar na criação.',
}

export type Objective = 'vender' | 'educar' | 'autoridade' | 'relacionamento' | 'leads' | 'alcance' | 'engajamento' | 'divulgar'

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  vender: 'Vender',
  educar: 'Educar',
  autoridade: 'Construir autoridade',
  relacionamento: 'Relacionamento',
  leads: 'Gerar leads',
  alcance: 'Alcance',
  engajamento: 'Engajamento',
  divulgar: 'Divulgar produto/evento',
}

export interface TextGenerationResult {
  caption: string
  hashtags: string[]
  cta: string
}

export interface CarrosselGenerationResult extends TextGenerationResult {
  slides: string[]
}

export interface ReelsGenerationResult extends TextGenerationResult {
  script: {
    hook: string
    development: string
    closing: string
  }
}

export interface ContentIdea {
  title: string
  description: string
  suggested_type: 'post' | 'carrossel' | 'reel'
}

export interface IdeasGenerationResult {
  ideas: ContentIdea[]
}

export type AnyGenerationResult =
  | TextGenerationResult
  | CarrosselGenerationResult
  | ReelsGenerationResult
  | IdeasGenerationResult

export interface AiGenerateResponse {
  generationId: string
  result: AnyGenerationResult
  creditCost: number
  provider: string
  model: string
}
