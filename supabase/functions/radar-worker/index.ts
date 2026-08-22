// Edge Function: worker do Radar Viral (Fase 8). Chamado por pg_cron
// (via pg_net), NUNCA pelo navegador. Pipeline dentro de uma única
// função (volume do MVP não justifica múltiplos deploys):
//   collect (YouTube) → normalize → dedupe (upsert por provider+external_id)
//   → cluster (1 chamada de IA global, não cobrada de nenhum workspace)
//   → viral_score (determinístico) → brand match (filtro léxico barato)
//   → top-N por workspace → brand_fit + ângulo (IA) → novelty (lexical,
//   SQL) → opportunity_score (determinístico) → upsert_radar_opportunity.
//
// Nenhum sinal é escrito direto pelo frontend; nenhuma oportunidade é
// criada sem passar pelas RPCs SECURITY DEFINER (evita bypass genérico
// de service_role em dados workspace-scoped — mesmo princípio da Fase 7).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { brandProfileToPromptText, isBrandProfileReady } from '../_shared/ai-gateway/brand-context.ts'
import { fetchYoutubeTrending, YoutubeApiError } from '../_shared/radar/youtube-provider.ts'
import { buildClusteringPrompt, buildRadarMatchPrompt, extractJson } from '../_shared/radar/prompt.ts'
import {
  computeBrandFitScore,
  computeConfidence,
  computeOpportunityScore,
  computeRecencyBonus,
  computeViralScore,
} from '../_shared/radar/scoring.ts'
import type { BrandFitWeights, NormalizedSignal, OpportunityWeights, RadarLimits, ViralWeights } from '../_shared/radar/types.ts'

const CLUSTER_EXPIRY_DAYS = 3
const OPPORTUNITY_TTL_DAYS = 7

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface AiUsageAccumulator {
  input_tokens: number
  output_tokens: number
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('RADAR_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const startedAt = Date.now()
  const providersAttempted: string[] = []
  const providersSucceeded: string[] = []
  const providersFailed: Record<string, string> = {}
  let signalsCollected = 0
  let signalsDeduplicated = 0
  let clustersCreated = 0
  let clustersUpdated = 0
  let workspacesProcessed = 0
  let opportunitiesCreated = 0
  let opportunitiesUpdated = 0
  let aiCalls = 0
  const aiUsage: AiUsageAccumulator = { input_tokens: 0, output_tokens: 0 }

  const { data: runRow, error: runInsertError } = await admin
    .from('radar_runs')
    .insert({ status: 'running' })
    .select('*')
    .single()
  if (runInsertError || !runRow) {
    console.error('radar-worker: falha ao criar radar_runs.', runInsertError)
    return json({ error: 'internal_error' }, 500)
  }

  try {
    // ── 1. Config centralizada (item 3/4/8 da aprovação) ──────────────
    const { data: scoringRows } = await admin.from('radar_scoring_config').select('key, value')
    const scoringMap = new Map((scoringRows ?? []).map((r) => [r.key as string, r.value]))
    const viralWeights = (scoringMap.get('viral_score_weights') as ViralWeights) ?? { recency: 30, engagement: 40, recurrence: 30 }
    const opportunityWeights = (scoringMap.get('opportunity_score_weights') as OpportunityWeights) ?? {
      viral: 0.35,
      brand_fit: 0.35,
      novelty: 0.2,
      recency_bonus: 0.1,
    }
    const brandFitWeights = (scoringMap.get('brand_fit_weights') as BrandFitWeights) ?? { nicho: 40, publico: 30, tom: 30 }
    const limits = (scoringMap.get('limits') as RadarLimits) ?? {
      max_signals_per_run: 60,
      max_clusters_per_run: 40,
      top_n_per_workspace: 5,
      max_workspaces_per_run: 50,
      novelty_lookback_days: 60,
    }

    const { data: providerRows } = await admin.from('radar_provider_config').select('*').eq('enabled', true)

    // ── 2. Collect + normalize + dedupe (por provider, isolado — um
    // provider fora do ar não derruba os demais nem o restante do pipeline) ──
    for (const provider of providerRows ?? []) {
      if (provider.provider !== 'youtube') continue // únicos providers implementados nesta fase: youtube (item 11 da aprovação)
      providersAttempted.push('youtube')

      const apiKey = Deno.env.get('YOUTUBE_API_KEY')
      if (!apiKey) {
        providersFailed.youtube = 'YOUTUBE_API_KEY não configurado.'
        continue
      }

      const { data: freshest } = await admin
        .from('radar_signals')
        .select('fetched_at')
        .eq('provider', 'youtube')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cacheAgeHours = freshest ? (Date.now() - new Date(freshest.fetched_at).getTime()) / 3_600_000 : Infinity
      if (cacheAgeHours < provider.cache_ttl_hours) {
        providersSucceeded.push('youtube')
        continue // cache ainda válido — não gasta quota à toa
      }

      try {
        const { signals } = await fetchYoutubeTrending(apiKey, 'BR', provider.max_signals_per_run)
        const nowIso = new Date().toISOString()
        const expiresAt = new Date(Date.now() + provider.cache_ttl_hours * 3_600_000).toISOString()

        // Snapshot de external_ids já existentes ANTES do upsert — a
        // comparação de timestamps (created_at vs. "agora") não é
        // confiável para distinguir insert de update dentro da mesma
        // chamada, já que o default now() da coluna roda no instante da
        // transação no Postgres, não no nowIso calculado aqui no worker.
        const { data: existingRows } = await admin
          .from('radar_signals')
          .select('external_id')
          .eq('provider', 'youtube')
          .in('external_id', signals.map((s) => s.externalId))
        const existingIds = new Set((existingRows ?? []).map((r) => r.external_id as string))

        for (const signal of signals) {
          const { error: upsertError } = await admin
            .from('radar_signals')
            .upsert(
              {
                provider: signal.provider,
                external_id: signal.externalId,
                signal_type: signal.signalType,
                title: signal.title,
                text_content: signal.textContent,
                url: signal.url,
                author_name: signal.authorName,
                author_handle: signal.authorHandle,
                published_at: signal.publishedAt,
                metrics: signal.metrics,
                raw_metadata: signal.rawMetadata,
                fetched_at: nowIso,
                expires_at: expiresAt,
              },
              { onConflict: 'provider,external_id' },
            )
          if (upsertError) throw upsertError
          signalsCollected += 1
          if (existingIds.has(signal.externalId)) signalsDeduplicated += 1
        }
        providersSucceeded.push('youtube')
      } catch (err) {
        const message = err instanceof YoutubeApiError ? err.message : err instanceof Error ? err.message : 'Erro desconhecido.'
        providersFailed.youtube = message
        console.error('radar-worker: falha no provider youtube.', err)
      }
    }

    // ── 3. Cluster (1 chamada de IA GLOBAL por run — não cobrada de
    // nenhum workspace, é custo operacional do POSTTOU) ────────────────
    const { data: alreadyClustered } = await admin.from('radar_cluster_signals').select('signal_id')
    const clusteredIds = new Set((alreadyClustered ?? []).map((r) => r.signal_id as string))

    const { data: candidateSignals } = await admin
      .from('radar_signals')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(limits.max_signals_per_run)

    const unclustered = (candidateSignals ?? []).filter((s) => !clusteredIds.has(s.id))

    if (unclustered.length) {
      try {
        const textProvider = getTextProvider()
        const { systemPrompt, userPrompt } = buildClusteringPrompt(
          unclustered.map((s) => ({ externalId: s.external_id, title: s.title, textContent: s.text_content })),
        )
        const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 2000 })
        aiCalls += 1
        aiUsage.input_tokens += result.usage?.inputTokens ?? 0
        aiUsage.output_tokens += result.usage?.outputTokens ?? 0

        const parsed = extractJson(result.text) as { clusters?: { theme_summary: string; primary_topic?: string; external_ids?: string[] }[] }
        const byExternalId = new Map(unclustered.map((s) => [s.external_id as string, s]))

        for (const cluster of parsed.clusters ?? []) {
          const validIds = (cluster.external_ids ?? []).filter((id) => byExternalId.has(id))
          if (!validIds.length || !cluster.theme_summary) continue

          const memberSignals = validIds.map((id) => byExternalId.get(id)!)
          const viral = computeViralScore(
            memberSignals.map((s) => ({ publishedAt: s.published_at, metrics: s.metrics as NormalizedSignal['metrics'] })),
            viralWeights,
          )
          const providerDiversity = new Set(memberSignals.map((s) => s.provider)).size

          const { data: newCluster, error: clusterError } = await admin
            .from('radar_clusters')
            .insert({
              theme_summary: cluster.theme_summary,
              primary_topic: cluster.primary_topic ?? null,
              signal_count: memberSignals.length,
              provider_diversity: providerDiversity,
              viral_score: viral.score,
              viral_score_breakdown: viral.breakdown,
              status: 'active',
            })
            .select('*')
            .single()
          if (clusterError || !newCluster) {
            console.error('radar-worker: falha ao criar cluster.', clusterError)
            continue
          }
          clustersCreated += 1

          await admin.from('radar_cluster_signals').insert(memberSignals.map((s) => ({ cluster_id: newCluster.id, signal_id: s.id })))
        }
      } catch (err) {
        const message = err instanceof ProviderNotConfiguredError ? err.message : err instanceof Error ? err.message : 'Erro desconhecido.'
        providersFailed.clustering_ai = message
        console.error('radar-worker: falha na clusterização por IA.', err)
      }
    }

    // Expira clusters inativos (sem novo sinal há CLUSTER_EXPIRY_DAYS).
    await admin
      .from('radar_clusters')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .lt('last_seen_at', new Date(Date.now() - CLUSTER_EXPIRY_DAYS * 86_400_000).toISOString())
      .eq('status', 'active')

    // ── 4. Brand match + opportunity (por workspace) ───────────────────
    const { data: brandProfiles } = await admin
      .from('brand_profiles')
      .select('*')
      .not('onboarding_completed_at', 'is', null)
      .limit(limits.max_workspaces_per_run)

    const { data: activeClusters } = await admin
      .from('radar_clusters')
      .select('*')
      .eq('status', 'active')
      .order('viral_score', { ascending: false })
      .limit(limits.max_clusters_per_run)

    for (const profile of brandProfiles ?? []) {
      if (!isBrandProfileReady(profile)) continue
      workspacesProcessed += 1

      const keywords = new Set<string>(
        [
          ...(profile.content_strategy?.priority_themes ?? []),
          ...(profile.vocabulary?.preferred_words ?? []),
          ...(profile.audience?.interests ?? []),
        ].map((k: string) => k.toLowerCase().trim()).filter(Boolean),
      )

      const scored = (activeClusters ?? [])
        .map((cluster) => {
          const haystack = `${cluster.theme_summary} ${cluster.primary_topic ?? ''}`.toLowerCase()
          const overlap = keywords.size ? [...keywords].filter((k) => haystack.includes(k)).length : 0
          return { cluster, overlap }
        })
        .filter((c) => c.overlap > 0 || keywords.size === 0)
        .sort((a, b) => b.overlap - a.overlap || (b.cluster.viral_score ?? 0) - (a.cluster.viral_score ?? 0))
        .slice(0, limits.top_n_per_workspace)

      for (const { cluster } of scored) {
        try {
          const brandProfileText = brandProfileToPromptText(profile)
          const breakdown = cluster.viral_score_breakdown ?? {}
          const facts = [
            `${cluster.signal_count} sinal(is) coletado(s) via YouTube (API oficial).`,
            breakdown.avg_days_since_published != null ? `Publicados em média há ${Math.round(breakdown.avg_days_since_published)} dia(s).` : null,
            breakdown.avg_engagement_rate != null ? `Taxa de engajamento média (curtidas+comentários/visualizações) do lote: ${(breakdown.avg_engagement_rate * 100).toFixed(1)}%.` : null,
          ]
            .filter(Boolean)
            .join(' ')

          const textProvider = getTextProvider()
          const { systemPrompt, userPrompt } = buildRadarMatchPrompt({
            brandProfileText,
            clusterThemeSummary: cluster.theme_summary,
            clusterPrimaryTopic: cluster.primary_topic,
            clusterFacts: facts,
            weights: brandFitWeights,
          })
          const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 800 })
          aiCalls += 1
          aiUsage.input_tokens += result.usage?.inputTokens ?? 0
          aiUsage.output_tokens += result.usage?.outputTokens ?? 0

          const parsed = extractJson(result.text) as {
            brand_fit?: { nicho?: number; publico?: number; tom?: number }
            suggested_title?: string
            suggested_angle?: string
            suggested_format?: string
          }

          const brandFit = computeBrandFitScore(
            { nicho: Number(parsed.brand_fit?.nicho ?? 0), publico: Number(parsed.brand_fit?.publico ?? 0), tom: Number(parsed.brand_fit?.tom ?? 0) },
            brandFitWeights,
          )

          const { data: noveltyScore } = await admin.rpc('radar_compute_novelty', {
            p_workspace_id: profile.workspace_id,
            p_theme_summary: cluster.theme_summary,
            p_lookback_days: limits.novelty_lookback_days,
          })

          const recencyBonus = computeRecencyBonus(breakdown.avg_days_since_published ?? null)
          const opportunityScore = computeOpportunityScore(cluster.viral_score ?? 0, brandFit.score, Number(noveltyScore ?? 100), recencyBonus, opportunityWeights)
          const confidence = computeConfidence(cluster.provider_diversity ?? 1, cluster.signal_count ?? 1, !!breakdown.renormalized)

          const suggestedFormat = ['post', 'carrossel', 'reel'].includes(parsed.suggested_format ?? '') ? parsed.suggested_format : 'post'

          const { data: upserted } = await admin.rpc('upsert_radar_opportunity', {
            p_workspace_id: profile.workspace_id,
            p_cluster_id: cluster.id,
            p_brand_fit_score: brandFit.score,
            p_brand_fit_breakdown: brandFit.breakdown,
            p_novelty_score: Number(noveltyScore ?? 100),
            p_novelty_method: 'lexical',
            p_opportunity_score: opportunityScore,
            p_confidence: confidence,
            p_suggested_title: parsed.suggested_title ?? null,
            p_suggested_angle: parsed.suggested_angle ?? null,
            p_suggested_format: suggestedFormat,
            p_ai_generation_id: null,
            p_expires_at: new Date(Date.now() + OPPORTUNITY_TTL_DAYS * 86_400_000).toISOString(),
          })
          if (upserted?.length) {
            const row = upserted[0]
            if (new Date(row.created_at).getTime() === new Date(row.updated_at).getTime()) opportunitiesCreated += 1
            else opportunitiesUpdated += 1
          }
        } catch (err) {
          console.error(`radar-worker: falha ao processar oportunidade (workspace ${profile.workspace_id}, cluster ${cluster.id}).`, err)
        }
      }
    }

    const finalStatus = Object.keys(providersFailed).length > 0 && providersSucceeded.length === 0 ? 'failed' : Object.keys(providersFailed).length > 0 ? 'partial_failure' : 'success'

    await admin
      .from('radar_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: finalStatus,
        providers_attempted: providersAttempted,
        providers_succeeded: providersSucceeded,
        providers_failed: providersFailed,
        signals_collected: signalsCollected,
        signals_deduplicated: signalsDeduplicated,
        clusters_created: clustersCreated,
        clusters_updated: clustersUpdated,
        workspaces_processed: workspacesProcessed,
        opportunities_created: opportunitiesCreated,
        opportunities_updated: opportunitiesUpdated,
        ai_calls: aiCalls,
        ai_usage: aiUsage,
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', runRow.id)

    return json({
      runId: runRow.id,
      status: finalStatus,
      signalsCollected,
      signalsDeduplicated,
      clustersCreated,
      workspacesProcessed,
      opportunitiesCreated,
      opportunitiesUpdated,
      aiCalls,
      providersFailed,
    })
  } catch (err) {
    console.error('radar-worker: erro inesperado.', err)
    await admin
      .from('radar_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Erro inesperado.',
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', runRow.id)
    return json({ error: 'internal_error' }, 500)
  }
})
