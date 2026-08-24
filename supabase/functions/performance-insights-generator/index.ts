// Edge Function: gerador de insights de Performance (Fase 10).
// Chamado por pg_cron 1x/dia — NUNCA pelo navegador. Prioriza insights
// 100% determinísticos (ajuste 7); só chama IA para SÍNTESE quando há
// fato novo/significativo desde a última rodada (nunca "porque passou um
// dia" — ajuste 6). A geração automática NUNCA debita crédito do cliente
// (ajuste 6) — só o caminho manual ("Explicar melhor", outra função)
// consome ai_operation_costs.
//
// Garantia contra número inventado (item 69 do plano): a IA só recebe os
// facts determinísticos e só pode responder usando placeholders
// {{chave}} — o texto final é montado substituindo os placeholders pelos
// valores reais do payload de facts. Se sobrar qualquer dígito no texto
// final que não veio de uma substituição, o insight de IA é descartado
// (fail closed) e nada é persistido.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'

const PERIOD_DAYS = 30
const SIGNIFICANT_DELTA_PCT = 15 // diferença mínima pra considerar um fato "significativo" o bastante pra valer síntese de IA

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
  overall: { avg_score?: number; avg_score_previous?: number; sample_size: number; sample_size_previous: number }
  best_format: { format: string; avg_score: number; sample_size: number } | null
  best_editorial_role: { editorial_role: string; avg_score: number; sample_size: number } | null
  best_origin: { origin: string; avg_score: number; sample_size: number } | null
  min_sample_provisional: number
}

const FORMAT_LABEL: Record<string, string> = { post: 'posts', carrossel: 'carrosséis', reel: 'reels' }
const ORIGIN_LABEL: Record<string, string> = { manual: 'criados manualmente', ia: 'gerados com IA', radar: 'baseados no Radar', autopilot: 'do Piloto Automático' }
const ROLE_LABEL: Record<string, string> = { educativo: 'educativos', autoridade: 'de autoridade', relacionamento: 'de relacionamento', venda: 'de venda' }

function confidenceFor(sampleSize: number, minProvisional: number): 'low' | 'medium' | 'high' {
  if (sampleSize < minProvisional) return 'low'
  if (sampleSize < minProvisional * 2) return 'medium'
  return 'high'
}

// deno-lint-ignore no-explicit-any
function deterministicCandidates(facts: Facts): Array<{ insight_type: string; title: string; description: string; evidence: Record<string, unknown>; sample_size: number; confidence: string }> {
  const candidates: ReturnType<typeof deterministicCandidates> = []

  if (facts.overall.avg_score != null && facts.overall.avg_score_previous != null && facts.overall.sample_size_previous > 0) {
    const delta = ((facts.overall.avg_score - facts.overall.avg_score_previous) / Math.max(facts.overall.avg_score_previous, 1)) * 100
    if (Math.abs(delta) >= SIGNIFICANT_DELTA_PCT) {
      candidates.push({
        insight_type: 'overall_score_trend',
        title: delta > 0 ? 'Sua performance geral melhorou' : 'Sua performance geral caiu',
        description: `Seu score médio de performance ${delta > 0 ? 'subiu' : 'caiu'} ${Math.abs(delta).toFixed(0)}% nos últimos ${PERIOD_DAYS} dias em relação ao período anterior (${facts.overall.avg_score} vs ${facts.overall.avg_score_previous}).`,
        evidence: { avg_score: facts.overall.avg_score, avg_score_previous: facts.overall.avg_score_previous, delta_pct: Number(delta.toFixed(1)) },
        sample_size: facts.overall.sample_size,
        confidence: confidenceFor(facts.overall.sample_size, facts.min_sample_provisional),
      })
    }
  }

  if (facts.best_format) {
    candidates.push({
      insight_type: 'best_format',
      title: `${FORMAT_LABEL[facts.best_format.format] ?? facts.best_format.format} estão performando bem`,
      description: `Seus ${FORMAT_LABEL[facts.best_format.format] ?? facts.best_format.format} tiveram o maior score médio de performance nos últimos ${PERIOD_DAYS} dias (${facts.best_format.avg_score}/100, com base em ${facts.best_format.sample_size} publicações).`,
      evidence: facts.best_format,
      sample_size: facts.best_format.sample_size,
      confidence: confidenceFor(facts.best_format.sample_size, facts.min_sample_provisional),
    })
  }

  if (facts.best_editorial_role) {
    candidates.push({
      insight_type: 'best_editorial_role',
      title: `Conteúdos ${ROLE_LABEL[facts.best_editorial_role.editorial_role] ?? facts.best_editorial_role.editorial_role} se destacam`,
      description: `Conteúdos com função editorial "${facts.best_editorial_role.editorial_role}" tiveram o maior score médio (${facts.best_editorial_role.avg_score}/100, com base em ${facts.best_editorial_role.sample_size} publicações) nos últimos ${PERIOD_DAYS} dias.`,
      evidence: facts.best_editorial_role,
      sample_size: facts.best_editorial_role.sample_size,
      confidence: confidenceFor(facts.best_editorial_role.sample_size, facts.min_sample_provisional),
    })
  }

  if (facts.best_origin && facts.best_origin.origin !== 'manual') {
    candidates.push({
      insight_type: 'best_origin',
      title: `Conteúdos ${ORIGIN_LABEL[facts.best_origin.origin] ?? facts.best_origin.origin} performam bem`,
      description: `Conteúdos ${ORIGIN_LABEL[facts.best_origin.origin] ?? facts.best_origin.origin} tiveram o maior score médio (${facts.best_origin.avg_score}/100, com base em ${facts.best_origin.sample_size} publicações) nos últimos ${PERIOD_DAYS} dias — ainda uma correlação, não uma causalidade comprovada.`,
      evidence: facts.best_origin,
      sample_size: facts.best_origin.sample_size,
      confidence: confidenceFor(facts.best_origin.sample_size, facts.min_sample_provisional),
    })
  }

  return candidates
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

  const { data: workspaces } = await admin.from('performance_scoring_config').select('workspace_id').not('workspace_id', 'is', null)
  // Fallback: workspaces com pelo menos 1 score computado, mesmo sem config própria.
  const { data: scoredWorkspaces } = await admin.from('content_performance_scores').select('workspace_id').limit(1000)
  const workspaceIds = [...new Set([...(workspaces ?? []).map((w: { workspace_id: string }) => w.workspace_id), ...(scoredWorkspaces ?? []).map((w: { workspace_id: string }) => w.workspace_id)])]

  const results: Array<{ workspaceId: string; newDeterministic: number; aiGenerated: boolean }> = []

  for (const workspaceId of workspaceIds) {
    const { data: facts, error: factsError } = await admin.rpc('compute_performance_facts', { p_workspace_id: workspaceId, p_period_days: PERIOD_DAYS })
    if (factsError || !facts) {
      console.error(`performance-insights-generator: falha ao computar facts de ${workspaceId}.`, factsError)
      continue
    }

    const candidates = deterministicCandidates(facts as Facts)
    let newCount = 0

    for (const c of candidates) {
      const signatureInput = JSON.stringify({ type: c.insight_type, evidence: c.evidence, period: (facts as Facts).period_start })
      const factSignature = await sha256Hex(signatureInput)

      const { error: insertError, data: inserted } = await admin
        .from('performance_insights')
        .insert({
          workspace_id: workspaceId,
          insight_type: c.insight_type,
          title: c.title,
          description: c.description,
          evidence: c.evidence,
          sample_size: c.sample_size,
          confidence: c.confidence,
          period_start: (facts as Facts).period_start,
          period_end: (facts as Facts).period_end,
          source: 'deterministic',
          fact_signature: factSignature,
        })
        .select('id')
        .single()

      // Conflito (23505) = mesmo fact_signature já existe — não é erro, é dedup esperado (nunca regenera o mesmo insight).
      if (!insertError && inserted) newCount += 1
    }

    let aiGenerated = false
    // Ajuste 6: só chama IA quando há fato NOVO e significativo (>=2 insights determinísticos novos nesta rodada).
    // Fase 14B: a síntese por IA é a parte paga daqui — gateada por
    // assinatura. Os insights determinísticos acima continuam funcionando
    // mesmo com assinatura expirada (não têm custo de IA).
    if (newCount >= 2) {
      const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
      if (entitlement?.allowed) {
        aiGenerated = await tryGenerateAiSynthesis(admin, workspaceId, facts as Facts, candidates)
      }
    }

    results.push({ workspaceId, newDeterministic: newCount, aiGenerated })
  }

  return json({ workspacesProcessed: results.length, results })
})

// deno-lint-ignore no-explicit-any
async function tryGenerateAiSynthesis(admin: any, workspaceId: string, facts: Facts, candidates: ReturnType<typeof deterministicCandidates>): Promise<boolean> {
  let textProvider
  try {
    textProvider = getTextProvider()
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) return false
    throw err
  }

  // Mapa de placeholders -> valor real. A IA só pode "escrever" usando estas chaves.
  const placeholders: Record<string, string> = {}
  for (const c of candidates) {
    for (const [k, v] of Object.entries(c.evidence)) {
      placeholders[`${c.insight_type}.${k}`] = String(v)
    }
  }

  const systemPrompt =
    'Você é um analista de dados que resume padrões de performance de conteúdo no Instagram. ' +
    'Você NUNCA escreve números diretamente. Todo número deve ser um placeholder no formato {{chave}}, ' +
    'usando EXATAMENTE uma das chaves fornecidas na lista de placeholders disponíveis. ' +
    'Nunca invente um placeholder que não esteja na lista. Nunca afirme causalidade, só correlação. ' +
    'Responda apenas com um JSON válido: {"title": "string curta", "description": "1-2 frases usando placeholders para qualquer número"}.'

  const userPrompt = `Fatos determinísticos do período ${facts.period_start} a ${facts.period_end}:\n${JSON.stringify(candidates.map((c) => ({ type: c.insight_type, evidence: c.evidence })))}\n\nPlaceholders disponíveis: ${Object.keys(placeholders).join(', ')}\n\nEscreva uma síntese curta conectando esses padrões.`

  const { data: generationRow } = await admin
    .from('ai_generations')
    .insert({
      workspace_id: workspaceId,
      generation_type: 'performance_insight',
      theme_input: 'sintese_automatica_performance',
      status: 'processing',
      provider: textProvider.name,
      model: 'pending',
      request_payload: { candidates: candidates.map((c) => c.insight_type), automatic: true, billed: false },
      credit_cost: 0,
    })
    .select('id')
    .single()

  try {
    const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 400 })
    const match = result.text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : result.text) as { title?: string; description?: string }
    if (!parsed.title || !parsed.description) throw new Error('Resposta da IA sem title/description.')

    const substitute = (text: string): { text: string; ok: boolean } => {
      let ok = true
      const substituted = text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_m, key) => {
        if (!(key in placeholders)) {
          ok = false
          return ''
        }
        return placeholders[key]
      })
      return { text: substituted, ok }
    }

    const title = substitute(parsed.title)
    const description = substitute(parsed.description)
    // Fail closed (item 69): se algum placeholder for desconhecido, OU se
    // sobrar qualquer dígito no texto final que não veio de uma
    // substituição válida (a IA tentou escrever um número livre),
    // descarta o insight — nunca persiste número não vindo dos facts.
    const hasStrayDigits = (raw: string) => /\d/.test(raw.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g, ''))
    const digitsOutsideSubstitutions = hasStrayDigits(parsed.description) || hasStrayDigits(parsed.title)

    if (!title.ok || !description.ok || digitsOutsideSubstitutions) {
      await admin.from('ai_generations').update({ status: 'failed', error_code: 'unsafe_output', error_message: 'IA tentou usar número ou placeholder fora dos facts fornecidos.', completed_at: new Date().toISOString() }).eq('id', generationRow?.id)
      return false
    }

    const evidence = Object.fromEntries(candidates.flatMap((c) => Object.entries(c.evidence).map(([k, v]) => [`${c.insight_type}.${k}`, v])))
    const signatureInput = JSON.stringify({ type: 'ai_synthesis', evidence, period: facts.period_start })
    const factSignature = await sha256Hex(signatureInput)

    await admin.from('performance_insights').insert({
      workspace_id: workspaceId,
      insight_type: 'ai_synthesis',
      title: title.text,
      description: description.text,
      evidence,
      sample_size: Math.min(...candidates.map((c) => c.sample_size)),
      confidence: candidates.every((c) => c.confidence === 'high') ? 'high' : 'medium',
      period_start: facts.period_start,
      period_end: facts.period_end,
      source: 'ai',
      ai_generation_id: generationRow?.id,
      fact_signature: factSignature,
    })

    await admin.from('ai_generations').update({ status: 'success', model: result.model, result_text: `${title.text}\n${description.text}`, completed_at: new Date().toISOString() }).eq('id', generationRow?.id)
    return true
  } catch (err) {
    await admin.from('ai_generations').update({ status: 'failed', error_code: 'generation_error', error_message: err instanceof Error ? err.message : 'Erro desconhecido.', completed_at: new Date().toISOString() }).eq('id', generationRow?.id)
    return false
  }
}
