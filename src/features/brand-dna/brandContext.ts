import type {
  AudienceSection,
  BrandProfileRow,
  ContentStrategySection,
  VisualIdentitySection,
  VocabularySection,
  VoiceSection,
} from '@/features/brand-dna/types'
import {
  EMPTY_AUDIENCE,
  EMPTY_CONTENT_STRATEGY,
  EMPTY_VISUAL_IDENTITY,
  EMPTY_VOCABULARY,
  EMPTY_VOICE,
} from '@/features/brand-dna/types'

/**
 * Único ponto do sistema que transforma o DNA da Marca salvo no banco em um
 * contexto estruturado. Toda geração de IA (Fase 4 em diante) deve consumir
 * este objeto — nenhuma feature deve ler brand_profiles diretamente e montar
 * seu próprio contexto.
 */
export interface BrandContext {
  ready: boolean
  identity: {
    companyName: string
    language: string
    description: string
    segment: string
    location: string
    website: string
    instagramHandle: string
    products: string
    services: string
    differentiators: string
    problemsSolved: string
  }
  audience: AudienceSection
  content_strategy: ContentStrategySection
  voice: Pick<VoiceSection, 'formality' | 'tone' | 'complexity' | 'personal_institutional'>
  personality: {
    traits: string[]
  }
  vocabulary: Pick<VocabularySection, 'preferred_words' | 'forbidden_words' | 'signature_expressions'>
  visual_identity: VisualIdentitySection & {
    /** Paths no bucket privado brand-assets — não URLs. Resolver com getBrandAssetSignedUrl quando necessário. */
    logoPath: string | null
    secondaryLogoPath: string | null
    avatarPath: string | null
  }
  preferences: {
    preferredCta: string
    emojiUsage: VocabularySection['emoji_usage']
    hashtagUsage: VocabularySection['hashtag_usage']
    hashtagStyle: string
  }
}

function asAudience(value: unknown): AudienceSection {
  return { ...EMPTY_AUDIENCE, ...(typeof value === 'object' && value ? value : {}) }
}

function asContentStrategy(value: unknown): ContentStrategySection {
  return { ...EMPTY_CONTENT_STRATEGY, ...(typeof value === 'object' && value ? value : {}) }
}

function asVoice(value: unknown): VoiceSection {
  return { ...EMPTY_VOICE, ...(typeof value === 'object' && value ? value : {}) }
}

function asVocabulary(value: unknown): VocabularySection {
  return { ...EMPTY_VOCABULARY, ...(typeof value === 'object' && value ? value : {}) }
}

function asVisualIdentity(value: unknown): VisualIdentitySection {
  return { ...EMPTY_VISUAL_IDENTITY, ...(typeof value === 'object' && value ? value : {}) }
}

/** Considera o DNA "pronto" quando o essencial para gerar conteúdo coerente existe. */
export function isBrandContextReady(profile: BrandProfileRow | null): boolean {
  if (!profile) return false
  return !!profile.company_name && !!profile.description && !!profile.onboarding_completed_at
}

export function buildBrandContext(profile: BrandProfileRow | null): BrandContext {
  const audience = asAudience(profile?.audience)
  const contentStrategy = asContentStrategy(profile?.content_strategy)
  const voice = asVoice(profile?.voice)
  const vocabulary = asVocabulary(profile?.vocabulary)
  const visualIdentity = asVisualIdentity(profile?.visual_identity)

  return {
    ready: isBrandContextReady(profile),
    identity: {
      companyName: profile?.company_name ?? '',
      language: profile?.primary_language ?? 'pt-BR',
      description: profile?.description ?? '',
      segment: profile?.segment ?? '',
      location: profile?.location ?? '',
      website: profile?.website ?? '',
      instagramHandle: profile?.instagram_handle ?? '',
      products: profile?.products ?? '',
      services: profile?.services ?? '',
      differentiators: profile?.differentiators ?? '',
      problemsSolved: profile?.problems_solved ?? '',
    },
    audience,
    content_strategy: contentStrategy,
    voice: {
      formality: voice.formality,
      tone: voice.tone,
      complexity: voice.complexity,
      personal_institutional: voice.personal_institutional,
    },
    personality: {
      traits: voice.personality_traits,
    },
    vocabulary: {
      preferred_words: vocabulary.preferred_words,
      forbidden_words: vocabulary.forbidden_words,
      signature_expressions: vocabulary.signature_expressions,
    },
    visual_identity: {
      ...visualIdentity,
      logoPath: profile?.logo_path ?? null,
      secondaryLogoPath: profile?.secondary_logo_path ?? null,
      avatarPath: profile?.avatar_path ?? null,
    },
    preferences: {
      preferredCta: vocabulary.preferred_cta,
      emojiUsage: vocabulary.emoji_usage,
      hashtagUsage: vocabulary.hashtag_usage,
      hashtagStyle: vocabulary.hashtag_style,
    },
  }
}

/**
 * Serializa o contexto em texto para uso direto em prompts de IA
 * (Fase 4). Mantido aqui para não duplicar a lógica de "como descrever
 * a marca para o modelo" em cada feature que gerar conteúdo.
 */
export function brandContextToPromptText(ctx: BrandContext): string {
  if (!ctx.ready) return 'DNA da marca ainda não configurado.'

  const lines: string[] = []
  lines.push(`Marca: ${ctx.identity.companyName} (${ctx.identity.segment || 'segmento não informado'})`)
  lines.push(`Descrição: ${ctx.identity.description}`)
  if (ctx.identity.differentiators) lines.push(`Diferenciais: ${ctx.identity.differentiators}`)
  if (ctx.identity.problemsSolved) lines.push(`Problemas que resolve: ${ctx.identity.problemsSolved}`)
  if (ctx.audience.interests.length || ctx.audience.pains.length) {
    lines.push(
      `Público: interesses [${ctx.audience.interests.join(', ')}], dores [${ctx.audience.pains.join(', ')}], desejos [${ctx.audience.desires.join(', ')}]`,
    )
  }
  if (ctx.content_strategy.priority_themes.length) {
    lines.push(`Temas prioritários: ${ctx.content_strategy.priority_themes.join(', ')}`)
  }
  if (ctx.content_strategy.topics_to_avoid.length) {
    lines.push(`Nunca abordar: ${ctx.content_strategy.topics_to_avoid.join(', ')}`)
  }
  lines.push(
    `Tom de voz: formalidade ${ctx.voice.formality}/100, humor ${ctx.voice.tone}/100, complexidade ${ctx.voice.complexity}/100, pessoal x institucional ${ctx.voice.personal_institutional}/100`,
  )
  if (ctx.personality.traits.length) lines.push(`Personalidade: ${ctx.personality.traits.join(', ')}`)
  if (ctx.vocabulary.preferred_words.length) lines.push(`Usar palavras: ${ctx.vocabulary.preferred_words.join(', ')}`)
  if (ctx.vocabulary.forbidden_words.length) lines.push(`Nunca usar palavras: ${ctx.vocabulary.forbidden_words.join(', ')}`)
  if (ctx.preferences.preferredCta) lines.push(`CTA preferido: ${ctx.preferences.preferredCta}`)
  lines.push(`Emojis: ${ctx.preferences.emojiUsage} | Hashtags: ${ctx.preferences.hashtagUsage} (${ctx.preferences.hashtagStyle || 'estilo livre'})`)

  return lines.join('\n')
}
