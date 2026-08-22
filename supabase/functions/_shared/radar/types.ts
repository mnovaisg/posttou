// Fase 8 — Radar Viral: contratos compartilhados entre providers,
// scoring e o worker. Um "metric" nunca é um número solto: sempre
// {value, available} — ausência de dado nunca vira zero (mesmo
// princípio já usado em instagram_handle_snapshots.fields_availability).
export interface SignalMetric {
  value: number | null
  available: boolean
}

export interface NormalizedSignal {
  provider: string
  externalId: string
  signalType: string
  title: string | null
  textContent: string | null
  url: string | null
  authorName: string | null
  authorHandle: string | null
  publishedAt: string | null
  metrics: Record<string, SignalMetric>
  rawMetadata: Record<string, unknown>
}

export interface ViralWeights {
  recency: number
  engagement: number
  recurrence: number
}

export interface OpportunityWeights {
  viral: number
  brand_fit: number
  novelty: number
  recency_bonus: number
}

export interface BrandFitWeights {
  nicho: number
  publico: number
  tom: number
}

export interface RadarLimits {
  max_signals_per_run: number
  max_clusters_per_run: number
  top_n_per_workspace: number
  max_workspaces_per_run: number
  novelty_lookback_days: number
}
