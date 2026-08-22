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
import type { TablesUpdate } from '@/types/database'

export interface BrandDnaDraft {
  companyName: string
  primaryLanguage: string
  description: string
  segment: string
  location: string
  website: string
  instagramHandle: string
  products: string
  services: string
  differentiators: string
  problemsSolved: string
  audience: AudienceSection
  contentStrategy: ContentStrategySection
  voice: VoiceSection
  vocabulary: VocabularySection
  visualIdentity: VisualIdentitySection
  /** Path no bucket privado brand-assets (não é URL pública) — resolver com useBrandAssetUrl. */
  logoPath: string
  secondaryLogoPath: string
  avatarPath: string
  onboardingStep: number
}

export function draftFromRow(row: BrandProfileRow): BrandDnaDraft {
  return {
    companyName: row.company_name ?? '',
    primaryLanguage: row.primary_language ?? 'pt-BR',
    description: row.description ?? '',
    segment: row.segment ?? '',
    location: row.location ?? '',
    website: row.website ?? '',
    instagramHandle: row.instagram_handle ?? '',
    products: row.products ?? '',
    services: row.services ?? '',
    differentiators: row.differentiators ?? '',
    problemsSolved: row.problems_solved ?? '',
    audience: { ...EMPTY_AUDIENCE, ...(typeof row.audience === 'object' && row.audience ? row.audience : {}) },
    contentStrategy: {
      ...EMPTY_CONTENT_STRATEGY,
      ...(typeof row.content_strategy === 'object' && row.content_strategy ? row.content_strategy : {}),
    },
    voice: { ...EMPTY_VOICE, ...(typeof row.voice === 'object' && row.voice ? row.voice : {}) },
    vocabulary: { ...EMPTY_VOCABULARY, ...(typeof row.vocabulary === 'object' && row.vocabulary ? row.vocabulary : {}) },
    visualIdentity: {
      ...EMPTY_VISUAL_IDENTITY,
      ...(typeof row.visual_identity === 'object' && row.visual_identity ? row.visual_identity : {}),
    },
    logoPath: row.logo_path ?? '',
    secondaryLogoPath: row.secondary_logo_path ?? '',
    avatarPath: row.avatar_path ?? '',
    onboardingStep: row.onboarding_step ?? 1,
  }
}

export function draftToPatch(draft: BrandDnaDraft): TablesUpdate<'brand_profiles'> {
  return {
    company_name: draft.companyName || null,
    primary_language: draft.primaryLanguage || 'pt-BR',
    description: draft.description || null,
    segment: draft.segment || null,
    location: draft.location || null,
    website: draft.website || null,
    instagram_handle: draft.instagramHandle || null,
    products: draft.products || null,
    services: draft.services || null,
    differentiators: draft.differentiators || null,
    problems_solved: draft.problemsSolved || null,
    audience: draft.audience as unknown as TablesUpdate<'brand_profiles'>['audience'],
    content_strategy: draft.contentStrategy as unknown as TablesUpdate<'brand_profiles'>['content_strategy'],
    voice: draft.voice as unknown as TablesUpdate<'brand_profiles'>['voice'],
    vocabulary: draft.vocabulary as unknown as TablesUpdate<'brand_profiles'>['vocabulary'],
    visual_identity: draft.visualIdentity as unknown as TablesUpdate<'brand_profiles'>['visual_identity'],
    logo_path: draft.logoPath || null,
    secondary_logo_path: draft.secondaryLogoPath || null,
    avatar_path: draft.avatarPath || null,
  }
}
