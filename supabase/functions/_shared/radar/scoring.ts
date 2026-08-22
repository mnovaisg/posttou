// Fase 8 — Radar Viral: fórmulas determinísticas (sem IA), pesos vindos
// de radar_scoring_config (nunca hardcoded/espalhados no frontend —
// item 3 da aprovação). Quando um componente não pode ser calculado por
// falta de dado, ele é OMITIDO e os pesos restantes são renormalizados —
// nunca um componente ausente vira zero silenciosamente.
import type { BrandFitWeights, NormalizedSignal, OpportunityWeights, ViralWeights } from './types.ts'

export interface ViralScoreResult {
  score: number
  breakdown: {
    weights_used: ViralWeights
    components_available: string[]
    renormalized: boolean
    signal_count: number
    avg_days_since_published: number | null
    avg_engagement_rate: number | null
  }
}

export function computeViralScore(
  signals: Pick<NormalizedSignal, 'publishedAt' | 'metrics'>[],
  weights: ViralWeights,
): ViralScoreResult {
  const now = Date.now()
  const availableComponents: string[] = []
  let total = 0
  let weightSum = 0

  const recencyDays = signals
    .map((s) => (s.publishedAt ? (now - new Date(s.publishedAt).getTime()) / 86_400_000 : null))
    .filter((d): d is number => d !== null)
  let avgDays: number | null = null
  if (recencyDays.length) {
    avgDays = recencyDays.reduce((a, b) => a + b, 0) / recencyDays.length
    // decai linearmente a 0 em ~14 dias
    const recencyScore = Math.max(0, weights.recency - avgDays * (weights.recency / 14))
    total += recencyScore
    weightSum += weights.recency
    availableComponents.push('recency')
  }

  const rates = signals
    .map((s) => {
      const views = s.metrics.views?.available ? s.metrics.views.value ?? 0 : null
      const likes = s.metrics.likes?.available ? s.metrics.likes.value ?? 0 : 0
      const comments = s.metrics.comments?.available ? s.metrics.comments.value ?? 0 : 0
      if (!views || views <= 0) return null
      return (likes + comments * 2) / views
    })
    .filter((r): r is number => r !== null)
  let avgRate: number | null = null
  if (rates.length) {
    avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
    // taxa de engajamento ~8% já satura o componente (vídeos em alta
    // raramente passam disso) — evita que um outlier domine o score.
    const engagementScore = Math.min(weights.engagement, (avgRate / 0.08) * weights.engagement)
    total += engagementScore
    weightSum += weights.engagement
    availableComponents.push('engagement')
  }

  // recorrência: quantos sinais distintos caíram neste cluster. Com 1
  // único provider no MVP este componente nunca reflete diversidade de
  // fonte real — só volume — e por isso confidence nunca chega a 'high'
  // sozinho por causa dele (ver computeConfidence).
  const recurrenceScore = Math.min(weights.recurrence, Math.max(0, signals.length - 1) * (weights.recurrence / 4))
  total += recurrenceScore
  weightSum += weights.recurrence
  availableComponents.push('recurrence')

  const renormalized = availableComponents.length < 3
  const score = weightSum > 0 ? Math.round(Math.min(100, Math.max(0, (total / weightSum) * 100))) : 0

  return {
    score,
    breakdown: {
      weights_used: weights,
      components_available: availableComponents,
      renormalized,
      signal_count: signals.length,
      avg_days_since_published: avgDays,
      avg_engagement_rate: avgRate,
    },
  }
}

export type Confidence = 'low' | 'medium' | 'high'

/**
 * Determinística (nunca vem da IA). Com 1 único provider disponível no
 * MVP (YouTube), providerDiversity nunca passa de 1 — por isso 'high'
 * está, de propósito, fora de alcance até um segundo provider real
 * entrar (documentado no relatório da Fase 8, item 9 da aprovação).
 */
export function computeConfidence(providerDiversity: number, signalCount: number, renormalized: boolean): Confidence {
  if (providerDiversity >= 2 && signalCount >= 3 && !renormalized) return 'high'
  if (signalCount >= 2) return 'medium'
  return 'low'
}

export interface BrandFitInput {
  nicho: number
  publico: number
  tom: number
}

export interface BrandFitResult {
  score: number
  breakdown: { nicho: number; publico: number; tom: number; weights: BrandFitWeights }
}

/**
 * Item 1 da aprovação: a IA só propõe os SUB-scores (0..peso de cada
 * eixo); o score final é sempre a soma determinística calculada aqui,
 * com clamp — nunca um número final solto vindo direto do LLM.
 */
export function computeBrandFitScore(subScores: BrandFitInput, weights: BrandFitWeights): BrandFitResult {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0))
  const nicho = clamp(subScores.nicho, weights.nicho)
  const publico = clamp(subScores.publico, weights.publico)
  const tom = clamp(subScores.tom, weights.tom)
  return { score: Math.round(nicho + publico + tom), breakdown: { nicho, publico, tom, weights } }
}

export function computeRecencyBonus(avgDaysSincePublished: number | null): number {
  if (avgDaysSincePublished === null) return 0
  return Math.max(0, Math.round(100 - avgDaysSincePublished * 10))
}

export function computeOpportunityScore(
  viralScore: number,
  brandFitScore: number,
  noveltyScore: number,
  recencyBonus: number,
  weights: OpportunityWeights,
): number {
  const score = viralScore * weights.viral + brandFitScore * weights.brand_fit + noveltyScore * weights.novelty + recencyBonus * weights.recency_bonus
  return Math.round(Math.min(100, Math.max(0, score)))
}
