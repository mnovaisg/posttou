import { supabase } from '@/lib/supabase/client'
import type { ContentPerformanceCard, ContentPerformanceScoreRow, ContentPerformanceSnapshotRow, PerformanceFacts, PerformanceInsightFeedback, PerformanceInsightRow } from '@/features/reports/types'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return { Authorization: `Bearer ${token}` }
}

export async function fetchPerformanceFacts(workspaceId: string, periodDays = 30): Promise<PerformanceFacts> {
  const { data, error } = await supabase.rpc('compute_performance_facts', { p_workspace_id: workspaceId, p_period_days: periodDays })
  if (error) throw error
  return data as unknown as PerformanceFacts
}

export async function fetchActiveInsights(workspaceId: string): Promise<PerformanceInsightRow[]> {
  const { data, error } = await supabase
    .from('performance_insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('generated_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

export async function setInsightFeedback(insightId: string, feedback?: PerformanceInsightFeedback, dismiss = false): Promise<PerformanceInsightRow> {
  const { data, error } = await supabase.rpc('set_performance_insight_feedback', { p_insight_id: insightId, p_feedback: feedback, p_dismiss: dismiss })
  if (error) throw error
  return data
}

export async function fetchTopContentPerformance(workspaceId: string, sinceDays = 30, limit = 12): Promise<ContentPerformanceCard[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: scores, error: scoresError } = await supabase
    .from('content_performance_scores')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit * 3)
  if (scoresError) throw scoresError

  const publicationIds = (scores ?? []).map((s: ContentPerformanceScoreRow) => s.instagram_publication_id)
  if (!publicationIds.length) return []

  const { data: publications, error: pubError } = await supabase
    .from('instagram_publications')
    .select('id, permalink, published_at, content_id, contents(title, type, origin, workspace_id)')
    .in('id', publicationIds)
    .eq('status', 'published')
    .gte('published_at', since)
  if (pubError) throw pubError

  const { data: snapshots } = await supabase
    .from('content_performance_snapshots')
    .select('*')
    .in('instagram_publication_id', publicationIds)
    .eq('collector_status', 'collected')
    .order('target_at', { ascending: false })

  const scoreByPub = new Map(scores?.map((s: ContentPerformanceScoreRow) => [s.instagram_publication_id, s]))
  const latestSnapshotByPub = new Map<string, ContentPerformanceSnapshotRow>()
  for (const snap of (snapshots ?? []) as ContentPerformanceSnapshotRow[]) {
    if (!latestSnapshotByPub.has(snap.instagram_publication_id)) latestSnapshotByPub.set(snap.instagram_publication_id, snap)
  }

  const cards: ContentPerformanceCard[] = (publications ?? [])
    // deno-lint-ignore no-explicit-any
    .map((pub: any) => ({
      content_id: pub.content_id,
      instagram_publication_id: pub.id,
      title: pub.contents?.title ?? 'Sem título',
      format: pub.contents?.type,
      published_at: pub.published_at,
      permalink: pub.permalink,
      origin: pub.contents?.origin,
      score: scoreByPub.get(pub.id) ?? null,
      latest_snapshot: latestSnapshotByPub.get(pub.id) ?? null,
    }))
    .sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1))
    .slice(0, limit)

  return cards
}

export async function fetchContentPerformance(instagramPublicationId: string): Promise<{ score: ContentPerformanceScoreRow | null; snapshots: ContentPerformanceSnapshotRow[] }> {
  const [{ data: score }, { data: snapshots }] = await Promise.all([
    supabase.from('content_performance_scores').select('*').eq('instagram_publication_id', instagramPublicationId).maybeSingle(),
    supabase.from('content_performance_snapshots').select('*').eq('instagram_publication_id', instagramPublicationId).order('target_at', { ascending: true }),
  ])
  return { score: score ?? null, snapshots: snapshots ?? [] }
}

export interface ExplainResult {
  title: string
  description: string
  generationId: string
  creditCost: number
}

export async function requestPerformanceExplanation(workspaceId: string, periodDays = 30): Promise<ExplainResult> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch(`${FUNCTIONS_URL}/performance-insight-explain`, { method: 'POST', headers, body: JSON.stringify({ workspaceId, periodDays }) })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível gerar a explicação.')
  return body
}
