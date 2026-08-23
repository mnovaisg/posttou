// Edge Function: collector global de métricas de Performance (Fase 10).
// Chamado por pg_cron a cada 15 min — NUNCA pelo navegador. Nunca altera o
// pipeline de publicação (Fase 7): só LÊ instagram_publications.ig_media_id
// já publicado e escreve em content_performance_snapshots/scores, tabelas
// próprias desta fase.
//
// Padrão: agenda buckets pendentes -> reivindica lote (FOR UPDATE SKIP
// LOCKED) -> consulta a Meta -> grava snapshot -> recalcula score
// determinístico. Erros de permissão nunca são tratados como "métrica
// indisponível" (ajuste 5); erros recuperáveis usam backoff, nunca retry
// infinito (ajuste 4 — a linha do bucket nunca é recriada, só atualizada).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decryptToken } from '../_shared/instagram/crypto.ts'
import {
  InstagramApiError,
  InstagramMediaUnavailableError,
  InstagramPermissionError,
  fetchMediaInsights,
  type MediaInsightsMetric,
} from '../_shared/instagram/provider.ts'

const BATCH_LIMIT = 50
const RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 180]
const API_VERSION = 'v25.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface SnapshotRow {
  id: string
  workspace_id: string
  content_id: string
  instagram_publication_id: string
  instagram_account_id: string
  age_bucket: string
  attempt_count: number
}

function nextRetryAt(attemptCount: number): { terminal: boolean; nextRetryAt: Date | null } {
  const idx = attemptCount - 1
  if (idx < 0 || idx >= RETRY_BACKOFF_MINUTES.length) return { terminal: true, nextRetryAt: null }
  return { terminal: false, nextRetryAt: new Date(Date.now() + RETRY_BACKOFF_MINUTES[idx] * 60_000) }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('PERFORMANCE_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const tokenEncryptionKey = Deno.env.get('INSTAGRAM_TOKEN_ENCRYPTION_KEY')
  const admin = createClient(supabaseUrl, serviceRoleKey)

  if (!tokenEncryptionKey) {
    console.error('performance-metrics-collector: INSTAGRAM_TOKEN_ENCRYPTION_KEY não configurado.')
    return json({ error: 'not_configured' }, 501)
  }

  const startedAt = Date.now()
  const { data: run } = await admin.from('performance_collection_runs').insert({}).select('id').single()
  const runId = run?.id as string | undefined

  const counters = { publications_scheduled: 0, snapshots_attempted: 0, snapshots_collected: 0, retries: 0, rate_limited_count: 0, permission_blocked_count: 0 }
  const errors: Array<{ snapshot_id: string; error: string }> = []

  const { data: scheduled, error: scheduleError } = await admin.rpc('ensure_performance_snapshots_scheduled', { p_lookback_days: 8, p_limit: 200 })
  if (scheduleError) console.error('performance-metrics-collector: falha ao agendar buckets.', scheduleError)
  counters.publications_scheduled = typeof scheduled === 'number' ? scheduled : 0

  const { data: claimed, error: claimError } = await admin.rpc('claim_performance_snapshots', { p_limit: BATCH_LIMIT })
  if (claimError) {
    console.error('performance-metrics-collector: falha ao reivindicar snapshots.', claimError)
    await finishRun(admin, runId, startedAt, counters, errors)
    return json({ error: 'internal_error' }, 500)
  }

  for (const row of (claimed ?? []) as SnapshotRow[]) {
    counters.snapshots_attempted += 1
    try {
      const outcome = await processSnapshot(admin, row, tokenEncryptionKey)
      if (outcome === 'collected') counters.snapshots_collected += 1
      if (outcome === 'retry_scheduled') counters.retries += 1
      if (outcome === 'permission_required') counters.permission_blocked_count += 1
      if (outcome === 'rate_limited') counters.rate_limited_count += 1
    } catch (err) {
      console.error(`performance-metrics-collector: erro inesperado no snapshot ${row.id}.`, err)
      errors.push({ snapshot_id: row.id, error: err instanceof Error ? err.message : 'erro desconhecido' })
      const { terminal, nextRetryAt: retryAt } = nextRetryAt(row.attempt_count)
      await admin
        .from('content_performance_snapshots')
        .update({
          collector_status: terminal ? 'failed' : 'pending',
          next_retry_at: terminal ? null : retryAt?.toISOString(),
          last_error_code: 'internal_error',
          last_error_message: err instanceof Error ? err.message : 'Erro inesperado.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }

  await finishRun(admin, runId, startedAt, counters, errors)
  return json({ ...counters, errors })
})

// deno-lint-ignore no-explicit-any
async function finishRun(admin: any, runId: string | undefined, startedAt: number, counters: Record<string, number>, errors: unknown[]) {
  if (!runId) return
  await admin
    .from('performance_collection_runs')
    .update({ finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, errors, ...counters })
    .eq('id', runId)
}

type Outcome = 'collected' | 'retry_scheduled' | 'permission_required' | 'media_unavailable' | 'failed' | 'rate_limited'

// deno-lint-ignore no-explicit-any
async function processSnapshot(admin: any, row: SnapshotRow, tokenEncryptionKey: string): Promise<Outcome> {
  const { data: publication } = await admin.from('instagram_publications').select('ig_media_id, content_id').eq('id', row.instagram_publication_id).single()
  if (!publication?.ig_media_id) {
    await terminal(admin, row, 'failed', 'missing_media_id', 'Publicação sem ig_media_id (não deveria acontecer para status=published).')
    return 'failed'
  }

  const { data: account } = await admin.from('instagram_accounts').select('*').eq('id', row.instagram_account_id).single()
  if (!account) {
    await terminal(admin, row, 'failed', 'account_not_found', 'Conta do Instagram não encontrada.')
    return 'failed'
  }

  if (account.status !== 'conectado' || !account.access_token_encrypted) {
    if (account.insights_status !== 'not_connected') {
      await admin.from('instagram_accounts').update({ insights_status: 'not_connected' }).eq('id', account.id)
    }
    return await scheduleRetry(admin, row, 'account_not_connected', 'Conta desconectada ou sem token.')
  }

  if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
    if (account.insights_status !== 'permission_required') {
      await admin.from('instagram_accounts').update({ insights_status: 'permission_required' }).eq('id', account.id)
    }
    return await scheduleRetry(admin, row, 'token_expired', 'Token de acesso expirado.')
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(account.access_token_encrypted, tokenEncryptionKey)
  } catch (err) {
    await terminal(admin, row, 'failed', 'token_decrypt_failed', err instanceof Error ? err.message : 'Falha ao decifrar token.')
    return 'failed'
  }

  try {
    const result = await fetchMediaInsights({ igMediaId: publication.ig_media_id, accessToken })

    if (account.insights_status !== 'available') {
      await admin.from('instagram_accounts').update({ insights_status: 'available' }).eq('id', account.id)
    }

    const values = result.values as Partial<Record<MediaInsightsMetric, number>>
    await admin
      .from('content_performance_snapshots')
      .update({
        collector_status: 'collected',
        captured_at: new Date().toISOString(),
        reach: values.reach ?? null,
        likes: values.likes ?? null,
        comments: values.comments ?? null,
        saved: values.saved ?? null,
        shares: values.shares ?? null,
        views: values.views ?? null,
        total_interactions: values.total_interactions ?? null,
        unsupported_metrics: result.unsupportedMetrics,
        raw_metrics: result.raw,
        api_version: API_VERSION,
        next_retry_at: null,
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    await admin.rpc('recompute_content_performance_score', { p_instagram_publication_id: row.instagram_publication_id })
    return 'collected'
  } catch (err) {
    if (err instanceof InstagramPermissionError) {
      await admin.from('instagram_accounts').update({ insights_status: 'permission_required' }).eq('id', account.id)
      await terminal(admin, row, 'permission_required', 'permission_required', err.message)
      return 'permission_required'
    }
    if (err instanceof InstagramMediaUnavailableError) {
      await terminal(admin, row, 'media_unavailable', 'media_unavailable', err.message)
      return 'media_unavailable'
    }
    const isRateLimited = err instanceof InstagramApiError && err.status === 429
    const recoverable = err instanceof InstagramApiError ? (err.status ?? 0) >= 500 || isRateLimited : true
    const outcome = await scheduleRetry(admin, row, isRateLimited ? 'rate_limited' : 'meta_error', err instanceof Error ? err.message : 'Erro desconhecido.', !recoverable)
    return isRateLimited ? 'rate_limited' : outcome
  }
}

// deno-lint-ignore no-explicit-any
async function terminal(admin: any, row: SnapshotRow, status: Outcome, errorCode: string, errorMessage: string) {
  await admin
    .from('content_performance_snapshots')
    .update({ collector_status: status, next_retry_at: null, last_error_code: errorCode, last_error_message: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', row.id)
}

// deno-lint-ignore no-explicit-any
async function scheduleRetry(admin: any, row: SnapshotRow, errorCode: string, errorMessage: string, forceTerminal = false): Promise<Outcome> {
  if (forceTerminal) {
    await terminal(admin, row, 'failed', errorCode, errorMessage)
    return 'failed'
  }
  const { terminal: isTerminal, nextRetryAt: retryAt } = nextRetryAt(row.attempt_count)
  await admin
    .from('content_performance_snapshots')
    .update({
      collector_status: isTerminal ? 'failed' : 'pending',
      next_retry_at: isTerminal ? null : retryAt?.toISOString(),
      last_error_code: errorCode,
      last_error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  return isTerminal ? 'failed' : 'retry_scheduled'
}
