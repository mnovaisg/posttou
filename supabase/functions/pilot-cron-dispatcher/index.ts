// Edge Function: dispatcher global do Piloto Automático (Fase 9).
// Chamado por pg_cron a cada 30 min, NUNCA pelo navegador. Um único job
// para todos os workspaces (item 59) — reivindica um LOTE de workspaces
// semi_auto elegíveis (sem plano ativo) e, para cada um, encadeia
// planejamento → geração via chamada HTTP interna às mesmas Edge
// Functions usadas pelo modo assistido (nenhuma lógica duplicada).
//
// Correção final da Fase 9: antes de processar planos novos, chama o
// recovery de itens presos em 'generating' (pilot_reclaim_stuck_plan_items)
// — vale para QUALQUER modo (assisted ou semi_auto), já que a geração
// assistida também roda de forma assíncrona e pode travar do mesmo jeito.
// Reaproveita este mesmo dispatcher/cron já existente — nenhuma infra paralela.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { generatePilotVisualAsset } from '../_shared/ai-gateway/pilot-visual-asset.ts'

const BATCH_LIMIT = 10 // item 60: nunca carregar todos os workspaces de uma vez
const RECOVERY_TIMEOUT_MINUTES = 10
const RECOVERY_MAX_ATTEMPTS = 3
const RECOVERY_LIMIT = 50
const VISUAL_AUTO_RETRY_LIMIT = 20 // Fase 13, ajuste 3: 1 retry automático controlado por página falhada

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('PILOT_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const functionsUrl = `${supabaseUrl}/functions/v1`

  // ── Recovery de itens presos (roda sempre, antes de tudo) ──
  const recoveryResults: unknown[] = []
  const { data: reclaimed, error: reclaimError } = await admin.rpc('pilot_reclaim_stuck_plan_items', {
    p_timeout_minutes: RECOVERY_TIMEOUT_MINUTES,
    p_max_attempts: RECOVERY_MAX_ATTEMPTS,
    p_limit: RECOVERY_LIMIT,
  })
  if (reclaimError) {
    console.error('pilot-cron-dispatcher: falha ao reivindicar itens travados.', reclaimError)
  } else {
    const requeuedPlanIds = [...new Set((reclaimed ?? []).filter((r: { outcome: string }) => r.outcome === 'requeued').map((r: { plan_id: string }) => r.plan_id))]
    for (const planId of requeuedPlanIds) {
      try {
        const genRes = await fetch(`${functionsUrl}/pilot-content-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-posttou-cron-secret': cronSecret },
          body: JSON.stringify({ planId }),
        })
        const genBody = await genRes.json()
        recoveryResults.push({ planId, outcome: genRes.ok ? 'recovery_retry_dispatched' : 'recovery_retry_failed', detail: genBody })
      } catch (err) {
        recoveryResults.push({ planId, outcome: 'recovery_retry_error', detail: err instanceof Error ? err.message : 'erro desconhecido' })
      }
    }
    if (reclaimed?.length) recoveryResults.unshift({ itemsEvaluated: reclaimed.length, breakdown: reclaimed })
  }

  // Fase 13, ajuste 3: retry automático controlado (1x) das páginas cuja
  // arte falhou na primeira tentativa — reaproveita o mesmo gerador
  // compartilhado do caminho inicial/manual. Nunca mexe no texto.
  const visualRetryResults: unknown[] = []
  const { data: retryPages, error: retryClaimError } = await admin.rpc('pilot_claim_visual_assets_for_auto_retry', { p_limit: VISUAL_AUTO_RETRY_LIMIT })
  if (retryClaimError) {
    console.error('pilot-cron-dispatcher: falha ao reivindicar retries automáticos de arte.', retryClaimError)
  } else if (retryPages?.length) {
    let mediaProvider
    try {
      mediaProvider = getMediaProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) mediaProvider = null
      else throw err
    }
    for (const page of retryPages) {
      if (!mediaProvider) {
        await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: page.id, p_reason: 'ai_not_configured' })
        visualRetryResults.push({ pageId: page.id, outcome: 'not_configured' })
        continue
      }
      const { data: content } = await admin.from('contents').select('id, workspace_id, title, caption').eq('id', page.content_id).single()
      if (!content) {
        await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: page.id, p_reason: 'content_not_found' })
        visualRetryResults.push({ pageId: page.id, outcome: 'content_not_found' })
        continue
      }
      const result = await generatePilotVisualAsset({
        admin,
        mediaProvider,
        supabaseUrl,
        workspaceId: content.workspace_id,
        pageId: page.id,
        contentId: content.id,
        contentContext: `Título: ${content.title}\nLegenda: ${content.caption ?? ''}`,
      })
      visualRetryResults.push({ pageId: page.id, outcome: result.ok ? 'retry_dispatched' : 'retry_failed', errorCode: result.errorCode })
    }
  }

  const { data: activeSemiAuto } = await admin
    .from('pilot_settings')
    .select('workspace_id')
    .eq('status', 'active')
    .eq('mode', 'semi_auto')
    .limit(BATCH_LIMIT * 3) // margem antes de filtrar por "já tem plano"

  const results: Array<{ workspaceId: string; outcome: string; detail?: unknown }> = []
  let processed = 0

  for (const row of activeSemiAuto ?? []) {
    if (processed >= BATCH_LIMIT) break
    const workspaceId = row.workspace_id as string

    const { data: activePlan } = await admin
      .from('pilot_plans')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['draft', 'awaiting_approval', 'approved', 'generating'])
      .maybeSingle()

    if (!activePlan) {
      // Precisa de plano novo — planeja e, se semi_auto, o plano já sai 'approved' (finalize_pilot_plan).
      processed += 1
      try {
        const planRes = await fetch(`${functionsUrl}/pilot-plan-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-posttou-cron-secret': cronSecret },
          body: JSON.stringify({ workspaceId }),
        })
        const planBody = await planRes.json()
        if (!planRes.ok) {
          results.push({ workspaceId, outcome: 'plan_failed', detail: planBody })
          continue
        }
        if (!planBody.itemsCreated) {
          results.push({ workspaceId, outcome: 'plan_empty' })
          continue
        }
        const genRes = await fetch(`${functionsUrl}/pilot-content-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-posttou-cron-secret': cronSecret },
          body: JSON.stringify({ planId: planBody.planId }),
        })
        const genBody = await genRes.json()
        results.push({ workspaceId, outcome: genRes.ok ? 'planned_and_generated' : 'generation_failed', detail: genBody })
      } catch (err) {
        console.error(`pilot-cron-dispatcher: falha processando workspace ${workspaceId}.`, err)
        results.push({ workspaceId, outcome: 'error', detail: err instanceof Error ? err.message : 'erro desconhecido' })
      }
      continue
    }

    if (activePlan.status === 'approved') {
      // Plano já existe e aprovado (ex.: geração anterior parou por falta de crédito) — retoma.
      processed += 1
      try {
        const genRes = await fetch(`${functionsUrl}/pilot-content-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-posttou-cron-secret': cronSecret },
          body: JSON.stringify({ planId: activePlan.id }),
        })
        const genBody = await genRes.json()
        results.push({ workspaceId, outcome: genRes.ok ? 'generation_resumed' : 'generation_failed', detail: genBody })
      } catch (err) {
        results.push({ workspaceId, outcome: 'error', detail: err instanceof Error ? err.message : 'erro desconhecido' })
      }
    }
    // draft/awaiting_approval/generating: nada a fazer neste tick (draft não deveria persistir; generating será retomado no próximo tick se travou).
  }

  return json({ workspacesEvaluated: activeSemiAuto?.length ?? 0, workspacesProcessed: processed, results, recovery: recoveryResults, visualAssetAutoRetry: visualRetryResults })
})
