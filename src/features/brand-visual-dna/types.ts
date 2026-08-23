import type { Tables } from '@/types/database'

export type BrandReferenceRow = Tables<'brand_reference_profiles'>
export type VisualDnaOptionSetRow = Tables<'visual_dna_option_sets'>
export type VisualDnaOptionRow = Tables<'visual_dna_options'>
export type BrandVisualDnaRow = Tables<'brand_visual_dna'>

export const LIKED_ASPECTS: { value: string; label: string }[] = [
  { value: 'visual', label: 'Estética visual' },
  { value: 'tom_de_voz', label: 'Tom de voz' },
  { value: 'temas', label: 'Temas' },
  { value: 'carrosseis', label: 'Forma dos carrosséis' },
  { value: 'forma_de_comunicar', label: 'Forma de comunicar' },
  { value: 'posicionamento', label: 'Posicionamento' },
]

// Espelho de exibição do vocabulário fixo (validação real acontece sempre
// no backend — supabase/functions/_shared/ai-gateway/visual-dna-context.ts).
export const VISUAL_DNA_VOCABULARY: Record<string, string[]> = {
  visual_direction: ['minimalista', 'editorial', 'vibrante_colorido', 'organico_natural', 'corporativo_serio', 'ousado_moderno'],
  visual_hierarchy: ['titulo_dominante', 'imagem_dominante', 'equilibrada'],
  composition_style: ['centralizada', 'assimetrica', 'grade', 'camadas_sobrepostas'],
  text_density: ['minima', 'moderada', 'densa'],
  contrast_level: ['baixo', 'medio', 'alto'],
  image_role: ['fundo_ambientacao', 'protagonista', 'elemento_de_apoio'],
  graphic_density: ['limpo', 'moderado', 'elementos_grafico_ricos'],
  spacing_style: ['respirado', 'compacto'],
  typography_direction: ['serifada_classica', 'sans_moderna', 'display_expressiva', 'manuscrita_organica'],
  tone_visual: ['sofisticado', 'acolhedor', 'energetico', 'profissional', 'divertido'],
}

export const VISUAL_DNA_ATTRIBUTE_LABELS: Record<string, string> = {
  visual_direction: 'Direção visual',
  visual_hierarchy: 'Hierarquia visual',
  composition_style: 'Estilo de composição',
  text_density: 'Densidade de texto',
  contrast_level: 'Nível de contraste',
  image_role: 'Papel da imagem',
  graphic_density: 'Densidade gráfica',
  spacing_style: 'Estilo de espaçamento',
  typography_direction: 'Direção tipográfica',
  tone_visual: 'Tom visual',
}
