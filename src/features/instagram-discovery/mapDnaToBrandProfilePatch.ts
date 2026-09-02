import { EMPTY_AUDIENCE, EMPTY_CONTENT_STRATEGY, EMPTY_VOCABULARY, EMPTY_VOICE } from '@/features/brand-dna/types'
import type { DiscoveryDna, DiscoveryProfileSummary } from '@/features/instagram-discovery/types'
import type { DnaReviewState } from '@/features/instagram-discovery/DnaReviewCards'
import type { TablesUpdate } from '@/types/database'

/**
 * Converte o DNA preliminar da Discovery (JSON da IA, com confidence e
 * source por campo) num patch de brand_profiles para pré-preencher o
 * wizard existente (BrandDnaPage). Só mapeia campos com correspondência
 * direta e honesta — nada é inventado; campos sem dado suficiente ficam
 * vazios para o usuário preencher/revisar no wizard antes de concluir.
 */
export function mapDiscoveryDnaToBrandProfilePatch(
  handle: string,
  profile: DiscoveryProfileSummary | undefined,
  dna: DiscoveryDna,
): TablesUpdate<'brand_profiles'> {
  const audience = {
    ...EMPTY_AUDIENCE,
    interests: dna.publico?.interesses ?? [],
    pains: dna.publico?.dores ?? [],
    desires: dna.publico?.desejos ?? [],
  }

  const contentStrategy = {
    ...EMPTY_CONTENT_STRATEGY,
    priority_themes: dna.estrategia?.temas_recorrentes ?? [],
    topics_to_cover: dna.oportunidades?.temas_com_potencial ?? [],
  }

  const voice = {
    ...EMPTY_VOICE,
    personality_traits: dna.voz?.personalidade ?? [],
  }

  const vocabulary = {
    ...EMPTY_VOCABULARY,
    preferred_words: dna.voz?.vocabulario_recomendado ?? [],
    forbidden_words: dna.voz?.palavras_evitar ?? [],
  }

  const nicho = [dna.identidade?.nicho?.value, dna.identidade?.subnicho?.value].filter(Boolean).join(' — ')

  return {
    company_name: profile?.name || null,
    description: dna.identidade?.descricao?.value || null,
    segment: nicho || null,
    instagram_handle: handle,
    audience: audience as unknown as TablesUpdate<'brand_profiles'>['audience'],
    content_strategy: contentStrategy as unknown as TablesUpdate<'brand_profiles'>['content_strategy'],
    voice: voice as unknown as TablesUpdate<'brand_profiles'>['voice'],
    vocabulary: vocabulary as unknown as TablesUpdate<'brand_profiles'>['vocabulary'],
  }
}

/**
 * Mesma conversão, mas a partir do DNA já revisado pelo usuário na tela
 * de cards (DnaReviewState) — usada pelo claim quando a sessão tem
 * dna_revisado. Prioridade sobre mapDiscoveryDnaToBrandProfilePatch:
 * quem chama decide (dna_revisado ?? dna_preliminar), nunca os dois
 * juntos. Diferente do mapeador do DNA original, este também leva
 * cores/estilo — o usuário pode ter preenchido esses campos na revisão,
 * mesmo que a IA nunca os tivesse sugerido.
 */
export function mapDnaReviewStateToBrandProfilePatch(handle: string, state: DnaReviewState): TablesUpdate<'brand_profiles'> {
  const audience = {
    ...EMPTY_AUDIENCE,
    interests: state.audienceInterests,
    pains: state.audiencePains,
    desires: state.audienceDesires,
  }

  const contentStrategy = {
    ...EMPTY_CONTENT_STRATEGY,
    priority_themes: state.themes,
  }

  const voice = {
    ...EMPTY_VOICE,
    personality_traits: state.personality,
  }

  const vocabulary = {
    ...EMPTY_VOCABULARY,
    preferred_words: state.preferredWords,
    forbidden_words: state.forbiddenWords,
  }

  const visualIdentity = {
    colors: state.colors,
    typography: '',
    visual_style: state.designStyle || '',
    references: [] as string[],
  }

  return {
    company_name: state.name || null,
    description: state.description || null,
    segment: state.segment || null,
    instagram_handle: handle,
    audience: audience as unknown as TablesUpdate<'brand_profiles'>['audience'],
    content_strategy: contentStrategy as unknown as TablesUpdate<'brand_profiles'>['content_strategy'],
    voice: voice as unknown as TablesUpdate<'brand_profiles'>['voice'],
    vocabulary: vocabulary as unknown as TablesUpdate<'brand_profiles'>['vocabulary'],
    visual_identity: visualIdentity as unknown as TablesUpdate<'brand_profiles'>['visual_identity'],
  }
}
