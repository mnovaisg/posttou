import type { AudienceSection, BrandProfileRow, ContentStrategySection, VocabularySection } from '@/features/brand-dna/types'

function asContentStrategy(row: BrandProfileRow): ContentStrategySection {
  return (typeof row.content_strategy === 'object' && row.content_strategy ? row.content_strategy : {}) as unknown as ContentStrategySection
}
function asAudience(row: BrandProfileRow): AudienceSection {
  return (typeof row.audience === 'object' && row.audience ? row.audience : {}) as unknown as AudienceSection
}
function asVocabulary(row: BrandProfileRow): VocabularySection {
  return (typeof row.vocabulary === 'object' && row.vocabulary ? row.vocabulary : {}) as unknown as VocabularySection
}

// Sugestões 100% determinísticas a partir do DNA já salvo — nenhuma
// chamada de IA, nenhum custo, nenhuma métrica inventada (nunca um
// "75M posts" fabricado). "Sugerir mais" só percorre o próximo lote do
// mesmo pool determinístico, nunca gera nada novo por IA.

function words(...lists: (string[] | undefined | null)[]): string[] {
  const set = new Set<string>()
  for (const list of lists) {
    for (const w of list ?? []) {
      const trimmed = w?.trim()
      if (trimmed) set.add(trimmed)
    }
  }
  return [...set]
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

/**
 * Termos do nicho: combina segmento + temas prioritários + interesses do
 * público, em pares curtos e diretos — nunca frases longas.
 */
export function suggestTerms(profile: BrandProfileRow | null | undefined): string[] {
  if (!profile) return []
  const segment = profile.segment?.trim()
  const contentStrategy = asContentStrategy(profile)
  const audience = asAudience(profile)
  const vocabulary = asVocabulary(profile)
  const themes = words(contentStrategy.priority_themes, contentStrategy.secondary_themes)
  const interests = words(audience.interests)
  const preferredWords = words(vocabulary.preferred_words)

  const out: string[] = []
  if (segment) out.push(segment)
  for (const t of themes) out.push(t)
  for (const i of interests) out.push(i)
  if (segment) {
    for (const t of themes.slice(0, 3)) out.push(`${segment} ${t}`.toLowerCase())
  }
  for (const w of preferredWords) out.push(w)

  return dedupe(out).filter((t) => t.length >= 3)
}

/**
 * Hashtags: mesmas fontes, mas slugificadas (sem espaço/acentuação) —
 * apresentação recebe o "#" na hora de exibir, nunca gravado com ele.
 */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function suggestHashtags(profile: BrandProfileRow | null | undefined): string[] {
  if (!profile) return []
  const segment = profile.segment?.trim()
  const contentStrategy = asContentStrategy(profile)
  const audience = asAudience(profile)
  const themes = words(contentStrategy.priority_themes, contentStrategy.secondary_themes)
  const interests = words(audience.interests)

  const raw = [segment, ...themes, ...interests].filter((v): v is string => !!v)
  const slugs = raw.map(slugify).filter((s) => s.length >= 3)
  return dedupe(slugs)
}

/**
 * Concorrentes: sem fonte automática confiável hoje (exigiria Instagram
 * Business Discovery, indisponível neste ambiente) — nunca inventa
 * perfis. Retorna sempre vazio; a UI mostra um estado honesto e mantém
 * a entrada manual por @. Arquitetura pronta para um dia chamar uma
 * Edge Function de sugestão real (mesmo padrão de fallback honesto do
 * business-discovery-provider: checa configuração antes de tentar).
 */
export function suggestCompetitors(_profile: BrandProfileRow | null | undefined): string[] {
  return []
}

/** Quantos itens de sugestão mostrar por "página" do "Sugerir mais" — não é regeneração, é paginação do mesmo pool. */
export const SUGGESTION_PAGE_SIZE = 6
