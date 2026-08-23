// Fase 12 — DNA Visual: vocabulário fixo por atributo (validado no backend,
// nunca prosa livre da IA) + tradução pra texto de prompt. Usado tanto por
// brand-visual-dna-generate (gera as 3 opções) quanto por ai-generate-image
// (injeta o DNA confirmado + referências nas gerações normais do usuário).
// deno-lint-ignore-file no-explicit-any

export const VISUAL_DNA_VOCABULARY = {
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
} as const

export type VisualDnaAttributeKey = keyof typeof VISUAL_DNA_VOCABULARY
export type VisualDnaAttributes = Partial<Record<VisualDnaAttributeKey, string>>

export function validateVisualDnaAttributes(attrs: Record<string, any>): VisualDnaAttributes {
  const out: VisualDnaAttributes = {}
  for (const key of Object.keys(VISUAL_DNA_VOCABULARY) as VisualDnaAttributeKey[]) {
    const value = attrs?.[key]
    const allowed = VISUAL_DNA_VOCABULARY[key] as readonly string[]
    if (typeof value === 'string' && allowed.includes(value)) {
      out[key] = value
    }
  }
  return out
}

const LABELS: Record<VisualDnaAttributeKey, string> = {
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

export function visualDnaToPromptText(attributes: VisualDnaAttributes | null): string {
  if (!attributes || Object.keys(attributes).length === 0) return ''
  const lines = (Object.keys(VISUAL_DNA_VOCABULARY) as VisualDnaAttributeKey[])
    .filter((key) => attributes[key])
    .map((key) => `${LABELS[key]}: ${attributes[key]!.replace(/_/g, ' ')}`)
  if (!lines.length) return ''
  return `DNA visual confirmado da marca (aplique como direção de estilo da imagem):\n${lines.join('\n')}`
}

export interface ReferenceForPrompt {
  handle: string
  reference_type: string | null
  liked_aspects: string[]
  notes: string | null
  status: string
  analysis: Record<string, any> | null
}

const LIKED_ASPECT_LABELS: Record<string, string> = {
  visual: 'estética visual',
  tom_de_voz: 'tom de voz',
  temas: 'temas abordados',
  carrosseis: 'forma dos carrosséis',
  forma_de_comunicar: 'forma de comunicar',
  posicionamento: 'posicionamento de marca',
}

// Só usa dado declarado pelo usuário (liked_aspects/notes) ou dado derivado
// já permitido em brand_reference_profiles.analysis (agregados, nunca
// legenda/texto integral) — nunca inventa característica de perfil não
// analisado (analysis null/status != 'analyzed').
export function referencesToPromptText(references: ReferenceForPrompt[]): string {
  const active = references.filter((r) => r.liked_aspects?.length || r.notes)
  if (!active.length) return ''

  const lines = active.map((ref) => {
    const aspectLabels = (ref.liked_aspects || []).map((a) => LIKED_ASPECT_LABELS[a] || a)
    const parts: string[] = [`@${ref.handle}`]
    if (aspectLabels.length) parts.push(`aspectos admirados: ${aspectLabels.join(', ')}`)
    if (ref.notes) parts.push(`observação do usuário: ${ref.notes}`)
    if (ref.status === 'analyzed' && ref.analysis?.format_distribution) {
      parts.push(`padrão de formato observado: ${JSON.stringify(ref.analysis.format_distribution)}`)
    }
    return `- ${parts.join(' | ')}`
  })

  return [
    'Referências de inspiração declaradas pelo usuário (use apenas como inspiração de direção, NUNCA como fonte a copiar):',
    lines.join('\n'),
    ANTI_COPY_INSTRUCTION,
  ].join('\n')
}

export const ANTI_COPY_INSTRUCTION =
  'REGRA OBRIGATÓRIA: nunca copie texto, legendas, frases, slogans, layout exato, elementos gráficos distintivos ou identidade visual de nenhuma referência. Referências servem só de inspiração de direção/estilo. Produza conteúdo 100% original e compatível com o DNA da própria marca.'
