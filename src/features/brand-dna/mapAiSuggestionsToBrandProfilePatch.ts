import { EMPTY_AUDIENCE, EMPTY_CONTENT_STRATEGY, EMPTY_VOCABULARY, EMPTY_VOICE } from '@/features/brand-dna/types'
import type { TablesUpdate } from '@/types/database'

/**
 * Mesmo formato retornado por brand-dna-assist (ver SUGGESTION_SCHEMA_HINT
 * na Edge Function) — duplicado aqui só como tipo, não como lógica: o
 * merge de AiAssistDialog (editor avançado, mescla numa aba já aberta) é
 * um caso de uso diferente deste (primeiro preenchimento, sem draft
 * anterior).
 */
export interface BrandDnaAiSuggestions {
  description?: string
  differentiators?: string
  problems_solved?: string
  audience?: { interests?: string[]; needs?: string[]; pains?: string[]; desires?: string[] }
  content_strategy?: { priority_themes?: string[]; objectives?: string[] }
  voice?: { personality_traits?: string[] }
  vocabulary?: { preferred_words?: string[] }
}

/**
 * Converte a sugestão do brand-dna-assist (fallback por descrição,
 * enquanto o Business Discovery por @ não está configurado) num patch de
 * brand_profiles — mesmos campos reais usados por mapDiscoveryDnaToBrandProfilePatch,
 * nenhum schema paralelo.
 */
export function mapAiSuggestionsToBrandProfilePatch(
  companyNameFallback: string | null,
  suggestions: BrandDnaAiSuggestions,
): TablesUpdate<'brand_profiles'> {
  return {
    company_name: companyNameFallback || null,
    description: suggestions.description || null,
    differentiators: suggestions.differentiators || null,
    problems_solved: suggestions.problems_solved || null,
    audience: {
      ...EMPTY_AUDIENCE,
      interests: suggestions.audience?.interests ?? [],
      needs: suggestions.audience?.needs ?? [],
      pains: suggestions.audience?.pains ?? [],
      desires: suggestions.audience?.desires ?? [],
    } as unknown as TablesUpdate<'brand_profiles'>['audience'],
    content_strategy: {
      ...EMPTY_CONTENT_STRATEGY,
      priority_themes: suggestions.content_strategy?.priority_themes ?? [],
      objectives: (suggestions.content_strategy?.objectives ?? []) as ContentStrategyObjectives,
    } as unknown as TablesUpdate<'brand_profiles'>['content_strategy'],
    voice: {
      ...EMPTY_VOICE,
      personality_traits: suggestions.voice?.personality_traits ?? [],
    } as unknown as TablesUpdate<'brand_profiles'>['voice'],
    vocabulary: {
      ...EMPTY_VOCABULARY,
      preferred_words: suggestions.vocabulary?.preferred_words ?? [],
    } as unknown as TablesUpdate<'brand_profiles'>['vocabulary'],
  }
}

type ContentStrategyObjectives = import('@/features/brand-dna/types').ContentObjective[]
