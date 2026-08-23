// Edge Function: gerador de Recomendações Estratégicas (Fase 11).
// Chamado por pg_cron 1x/dia — NUNCA pelo navegador. Reaproveita
// compute_performance_facts (Fase 10) como única fonte de fatos — nenhum
// recálculo paralelo de performance. V1 sem LLM (aprovado): interpretation
// e hypothesis são templates determinísticos, nunca texto de IA.
//
// Fluxo: fact -> classificação de confiança (reaproveita
// min_sample_provisional/min_sample_ready da Fase 10) -> candidato de
// recomendação -> dedup por fingerprint -> cap de 3 ativas por workspace
// -> strategy_recommendations (status='proposed'). Nenhuma settings de
// pilot_settings é alterada aqui — só a RPC apply_strategy_recommendation,
// chamada pelo usuário, muda o Piloto de verdade.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PERIOD_DAYS = 30
const SIGNIFICANT_DELTA_PCT = 15
const MAX_ACTIVE_RECOMMENDATIONS = 3
const EXPIRES_IN_DAYS = 30

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface Facts {
  workspace_id: string
  period_start: string
  period_end: string
  overall: { avg_score: number | null; sample_size: number }
  best_format: { format: string; avg_score: number; sample_size: number } | null
  best_editorial_role: { editorial_role: string; avg_score: number; sample_size: number } | null
  best_origin: { origin: string; avg_score: number; sample_size: number } | null
  min_sample_provisional: number
}

const FORMAT_LABEL: Record<string, string> = { post: 'posts', carrossel: 'carrosséis' }
const ROLE_LABEL: Record<string, string> = { educativo: 'educativos', autoridade: 'de autoridade', relacionamento: 'de relacionamento', venda: 'de venda' }
const ORIGIN_LABEL: Record<string, string> = { manual: 'manuais', ia: 'gerados com IA', radar: 'baseados no Radar', autopilot: 'do Piloto' }

function confidenceFor(sampleSize: number, minProvisional: number, minReady: number): 'low' | 'medium' | 'high' {
  if (sampleSize < minProvisional) return 'low'
  if (sampleSize < minReady) return 'medium'
  return 'high'
}
const CONFIDENCE_WEIGHT: Record<string, number> = { low: 0.3, medium: 0.6, high: 1.0 }

interface Candidate {
  recommendation_type: 'settings_change' | 'experiment_suggestion' | 'informational'
  target: string | null
  operation: string | null
  before: unknown
  after: unknown
  fact: Record<string, unknown>
  interpretation: string
  evidence: Record<string, unknown>
  sample_size: number
  confidence: 'low' | 'medium' | 'high'
  fingerprintKey: string
  priority_score: number
}

function normalizeMix(mix: Record<string, number>): Record<string, number> {
  const sum = Object.values(mix).reduce((a, b) => a + b, 0)
  if (sum <= 0) return mix
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(mix)) out[k] = Math.round((v / sum) * 1000) / 10
  return out
}

// Desloca a chave vencedora +15pp (capado em 80), renormaliza o resto proporcionalmente.
function shiftMix(current: Record<string, number>, winnerKey: string, stepPp = 15): Record<string, number> {
  const shifted = { ...current }
  const currentWinner = shifted[winnerKey] ?? 0
  const target = Math.min(currentWinner + stepPp, 80)
  const delta = target - currentWinner
  shifted[winnerKey] = target
  const others = Object.keys(shifted).filter((k) => k !== winnerKey)
  const othersSum = others.reduce((a, k) => a + (current[k] ?? 0), 0)
  if (othersSum > 0) {
    for (const k of others) {
      shifted[k] = Math.max(0, (current[k] ?? 0) - delta * ((current[k] ?? 0) / othersSum))
    }
  }
  return normalizeMix(shifted)
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('PERFORMANCE_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: scoredWorkspaces } = await admin.from('content_performance_scores').select('workspace_id').limit(2000)
  const workspaceIds = [...new Set((scoredWorkspaces ?? []).map((w: { workspace_id: string }) => w.workspace_id))]

  const results: Array<{ workspaceId: string; created: number }> = []

  for (const workspaceId of workspaceIds) {
    const startedAt = Date.now()
    const { data: run } = await admin.from('strategy_recommendation_runs').insert({ workspace_id: workspaceId }).select('id').single()
    const runId = run?.id as string | undefined
    const counters = { candidates_evaluated: 0, recommendations_created: 0, deduplicated: 0, skipped_low_sample: 0, stale_count: 0 }
    const errors: Array<{ error: string }> = []

    try {
      // Reaproveita o próprio compute_experiment_result (item 62: sem cron
      // dedicado) para manter experimentos ativos avançando.
      const { data: activeExperiments } = await admin.from('strategy_experiments').select('id').eq('workspace_id', workspaceId).eq('status', 'active')
      for (const exp of activeExperiments ?? []) {
        await admin.rpc('compute_experiment_result', { p_experiment_id: (exp as { id: string }).id }).catch((err: unknown) => errors.push({ error: String(err) }))
      }

      const { data: facts, error: factsError } = await admin.rpc('compute_performance_facts', { p_workspace_id: workspaceId, p_period_days: PERIOD_DAYS })
      if (factsError || !facts) {
        errors.push({ error: factsError?.message ?? 'facts vazios' })
      } else {
        const f = facts as Facts
        const { data: settings } = await admin.from('pilot_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()

        const candidates: Candidate[] = []

        // ── formato ──
        if (f.best_format) {
          counters.candidates_evaluated += 1
          const deltaPct = f.overall.avg_score ? Math.round(((f.best_format.avg_score - f.overall.avg_score) / f.overall.avg_score) * 1000) / 10 : 0
          const conf = confidenceFor(f.best_format.sample_size, f.min_sample_provisional, f.min_sample_provisional * 2)
          const label = FORMAT_LABEL[f.best_format.format] ?? f.best_format.format
          const isSettingsChange = conf === 'high' && Math.abs(deltaPct) >= SIGNIFICANT_DELTA_PCT && settings?.allowed_formats?.length > 1
          if (isSettingsChange && settings) {
            const currentMix: Record<string, number> = settings.format_mix ?? Object.fromEntries((settings.allowed_formats as string[]).map((fmt) => [fmt, 100 / settings.allowed_formats.length]))
            const proposedMix = shiftMix(currentMix, f.best_format.format)
            candidates.push({
              recommendation_type: 'settings_change',
              target: 'format_mix',
              operation: 'replace',
              before: settings.format_mix ?? null,
              after: proposedMix,
              fact: { avg_score: f.best_format.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct, sample_size: f.best_format.sample_size },
              interpretation: `Seus ${label} estão ${deltaPct}% acima do seu baseline (score médio ${f.best_format.avg_score}/100 vs ${f.overall.avg_score}/100 geral), com base em ${f.best_format.sample_size} publicações nos últimos ${PERIOD_DAYS} dias.`,
              evidence: { format: f.best_format.format, avg_score: f.best_format.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct },
              sample_size: f.best_format.sample_size,
              confidence: conf,
              fingerprintKey: `format_mix:${f.best_format.format}:increase:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * Math.min(f.best_format.sample_size / (f.min_sample_provisional * 2), 1.5),
            })
          } else if (f.best_format.sample_size >= f.min_sample_provisional) {
            candidates.push({
              recommendation_type: 'experiment_suggestion',
              target: null, operation: null, before: null, after: null,
              fact: { avg_score: f.best_format.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct, sample_size: f.best_format.sample_size },
              interpretation: `Seus ${label} tiveram desempenho ${deltaPct >= 0 ? 'acima' : 'próximo'} do seu baseline (${f.best_format.sample_size} publicações), mas ainda não é amostra suficiente para uma mudança permanente. Vale testar mais alguns antes de decidir.`,
              evidence: { format: f.best_format.format, avg_score: f.best_format.avg_score, delta_pct: deltaPct },
              sample_size: f.best_format.sample_size,
              confidence: conf,
              fingerprintKey: `format_experiment:${f.best_format.format}:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * Math.min(f.best_format.sample_size / (f.min_sample_provisional * 2), 1.5),
            })
          } else {
            counters.skipped_low_sample += 1
          }
        }

        // ── papel editorial ──
        if (f.best_editorial_role) {
          counters.candidates_evaluated += 1
          const deltaPct = f.overall.avg_score ? Math.round(((f.best_editorial_role.avg_score - f.overall.avg_score) / f.overall.avg_score) * 1000) / 10 : 0
          const conf = confidenceFor(f.best_editorial_role.sample_size, f.min_sample_provisional, f.min_sample_provisional * 2)
          const label = ROLE_LABEL[f.best_editorial_role.editorial_role] ?? f.best_editorial_role.editorial_role
          const isSettingsChange = conf === 'high' && Math.abs(deltaPct) >= SIGNIFICANT_DELTA_PCT && settings
          if (isSettingsChange && settings) {
            const proposedMix = shiftMix(settings.editorial_mix as Record<string, number>, f.best_editorial_role.editorial_role)
            candidates.push({
              recommendation_type: 'settings_change',
              target: 'editorial_mix',
              operation: 'replace',
              before: settings.editorial_mix,
              after: proposedMix,
              fact: { avg_score: f.best_editorial_role.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct, sample_size: f.best_editorial_role.sample_size },
              interpretation: `Conteúdos ${label} estão ${deltaPct}% acima do seu baseline (score médio ${f.best_editorial_role.avg_score}/100 vs ${f.overall.avg_score}/100 geral), com base em ${f.best_editorial_role.sample_size} publicações nos últimos ${PERIOD_DAYS} dias.`,
              evidence: { editorial_role: f.best_editorial_role.editorial_role, avg_score: f.best_editorial_role.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct },
              sample_size: f.best_editorial_role.sample_size,
              confidence: conf,
              fingerprintKey: `editorial_mix:${f.best_editorial_role.editorial_role}:increase:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * Math.min(f.best_editorial_role.sample_size / (f.min_sample_provisional * 2), 1.5),
            })
          } else if (f.best_editorial_role.sample_size >= f.min_sample_provisional) {
            candidates.push({
              recommendation_type: 'experiment_suggestion',
              target: null, operation: null, before: null, after: null,
              fact: { avg_score: f.best_editorial_role.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct, sample_size: f.best_editorial_role.sample_size },
              interpretation: `Conteúdos ${label} vêm performando ${deltaPct >= 0 ? 'acima' : 'próximo'} do seu baseline (${f.best_editorial_role.sample_size} publicações). Ainda não é amostra suficiente para mudar a estratégia — testar mais alguns ajudaria a confirmar o padrão.`,
              evidence: { editorial_role: f.best_editorial_role.editorial_role, avg_score: f.best_editorial_role.avg_score, delta_pct: deltaPct },
              sample_size: f.best_editorial_role.sample_size,
              confidence: conf,
              fingerprintKey: `editorial_experiment:${f.best_editorial_role.editorial_role}:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * Math.min(f.best_editorial_role.sample_size / (f.min_sample_provisional * 2), 1.5),
            })
          } else {
            counters.skipped_low_sample += 1
          }
        }

        // ── origem (Radar) ──
        if (f.best_origin && f.best_origin.origin === 'radar' && settings?.use_radar) {
          counters.candidates_evaluated += 1
          const deltaPct = f.overall.avg_score ? Math.round(((f.best_origin.avg_score - f.overall.avg_score) / f.overall.avg_score) * 1000) / 10 : 0
          const conf = confidenceFor(f.best_origin.sample_size, f.min_sample_provisional, f.min_sample_provisional * 2)
          if (conf === 'high' && deltaPct >= SIGNIFICANT_DELTA_PCT && settings.max_radar_per_window < settings.max_posts_per_window) {
            candidates.push({
              recommendation_type: 'settings_change',
              target: 'max_radar_per_window',
              operation: 'replace',
              before: settings.max_radar_per_window,
              after: settings.max_radar_per_window + 1,
              fact: { avg_score: f.best_origin.avg_score, overall_avg_score: f.overall.avg_score, delta_pct: deltaPct, sample_size: f.best_origin.sample_size },
              interpretation: `Conteúdos baseados no Radar estão ${deltaPct}% acima do seu baseline (${f.best_origin.sample_size} publicações nos últimos ${PERIOD_DAYS} dias). Pode valer aumentar o limite de conteúdos do Radar por janela do Piloto.`,
              evidence: { origin: 'radar', avg_score: f.best_origin.avg_score, delta_pct: deltaPct },
              sample_size: f.best_origin.sample_size,
              confidence: conf,
              fingerprintKey: `max_radar_per_window:increase:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * Math.min(f.best_origin.sample_size / (f.min_sample_provisional * 2), 1.5),
            })
          } else if (f.best_origin.sample_size >= f.min_sample_provisional) {
            candidates.push({
              recommendation_type: 'informational',
              target: null, operation: null, before: null, after: null,
              fact: { avg_score: f.best_origin.avg_score, delta_pct: deltaPct, sample_size: f.best_origin.sample_size },
              interpretation: `Conteúdos ${ORIGIN_LABEL['radar']} tiveram desempenho ${deltaPct >= 0 ? 'acima' : 'próximo'} do seu baseline nos últimos ${PERIOD_DAYS} dias (${f.best_origin.sample_size} publicações) — ainda uma correlação, não uma causa comprovada.`,
              evidence: { origin: 'radar', avg_score: f.best_origin.avg_score, delta_pct: deltaPct },
              sample_size: f.best_origin.sample_size,
              confidence: conf,
              fingerprintKey: `origin_info:radar:${f.period_start}`,
              priority_score: Math.abs(deltaPct) * CONFIDENCE_WEIGHT[conf] * 0.5,
            })
          } else {
            counters.skipped_low_sample += 1
          }
        }

        // ── cap de 3 ativas + dedup ──
        const { count: activeCount } = await admin.from('strategy_recommendations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'proposed')
        let slotsLeft = MAX_ACTIVE_RECOMMENDATIONS - (activeCount ?? 0)
        candidates.sort((a, b) => b.priority_score - a.priority_score)

        for (const c of candidates) {
          if (slotsLeft <= 0) break
          const fingerprint = await sha256Hex(`${workspaceId}:${c.fingerprintKey}`)
          const { error: insertError } = await admin.from('strategy_recommendations').insert({
            workspace_id: workspaceId,
            recommendation_type: c.recommendation_type,
            fact: c.fact,
            interpretation: c.interpretation,
            target: c.target,
            operation: c.operation,
            before: c.before,
            after: c.after,
            evidence: c.evidence,
            sample_size: c.sample_size,
            confidence: c.confidence,
            period_start: f.period_start,
            period_end: f.period_end,
            fingerprint,
            priority_score: c.priority_score,
            expires_at: new Date(Date.now() + EXPIRES_IN_DAYS * 86_400_000).toISOString(),
          })
          if (insertError) {
            // 23505 = fingerprint já existe (dedup esperado, não é erro).
            if ((insertError as { code?: string }).code === '23505') counters.deduplicated += 1
            else errors.push({ error: insertError.message })
          } else {
            counters.recommendations_created += 1
            slotsLeft -= 1
          }
        }
      }
    } catch (err) {
      errors.push({ error: err instanceof Error ? err.message : 'erro desconhecido' })
    }

    if (runId) {
      await admin
        .from('strategy_recommendation_runs')
        .update({ finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, errors, ...counters })
        .eq('id', runId)
    }
    results.push({ workspaceId, created: counters.recommendations_created })
  }

  return json({ workspacesProcessed: results.length, results })
})
