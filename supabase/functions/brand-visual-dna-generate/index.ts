// Fase 12 — Gera as 3 direções visuais comparáveis (A/B/C) de uma rodada.
// Fluxo em 2 estágios, sempre via AI Gateway:
//  1) texto (getTextProvider): 1 brief criativo compartilhado + 3 conjuntos
//     de atributos de vocabulário fixo (ajuste 2 — comparabilidade
//     obrigatória: mesmo tema/mensagem/objetivo, só o tratamento visual
//     varia) + 1 prompt de imagem por opção.
//  2) imagem (getMediaProvider), 3x — mesma mecânica assíncrona/task-based
//     do Editor Visual (ai-generate-image), completada pelo mesmo webhook
//     (ai-webhook → complete-image-generation.ts, genérico, sem alterações).
//
// Idempotência/crédito/lock ficam inteiramente na RPC claim_visual_dna_generation
// (chamada primeiro) — esta função só usa o resultado dela.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { brandProfileToPromptText } from '../_shared/ai-gateway/brand-context.ts'
import { ANTI_COPY_INSTRUCTION, referencesToPromptText, validateVisualDnaAttributes, type ReferenceForPrompt } from '../_shared/ai-gateway/visual-dna-context.ts'
import { buildVisualDnaPrompt } from '../_shared/ai-gateway/visual-dna-prompt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

  const body = await req.json().catch(() => null)
  const workspaceId = (body as Record<string, unknown> | null)?.workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)

  // claim_visual_dna_generation resolve sozinha: role owner/admin, lock por
  // workspace (dois cliques não geram 2 rodadas), contagem de rodada que
  // nunca reseta, e cobrança de crédito quando aplicável (ajuste 1).
  const { data: optionSet, error: claimError } = await userClient.rpc('claim_visual_dna_generation', { p_workspace_id: workspaceId })
  if (claimError || !optionSet) {
    const message = claimError?.message ?? 'Não foi possível iniciar a geração.'
    const status = message.includes('Saldo') || message.includes('insuficiente') ? 402 : message.includes('em andamento') ? 409 : message.includes('owner/admin') ? 403 : 400
    return json({ error: message }, status)
  }
  const optionSetId = optionSet.id as string

  try {
    const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle()
    const brandText = brandProfileToPromptText(brandProfile ?? null)

    const { data: referenceRows } = await admin
      .from('brand_reference_profiles')
      .select('handle, reference_type, liked_aspects, notes, status, analysis')
      .eq('workspace_id', workspaceId)
      .is('removed_at', null)
    const references = (referenceRows ?? []) as ReferenceForPrompt[]
    const referencesText = referencesToPromptText(references)

    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'ai_not_configured' })
        return json({ error: 'not_configured', message: 'A geração de direções visuais ainda não está configurada neste ambiente.' }, 501)
      }
      throw err
    }

    let mediaProvider
    try {
      mediaProvider = getMediaProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'ai_not_configured' })
        return json({ error: 'not_configured', message: 'A geração de direções visuais ainda não está configurada neste ambiente.' }, 501)
      }
      throw err
    }

    const { systemPrompt, userPrompt } = buildVisualDnaPrompt({ brandText, referencesText })

    let parsed: any
    try {
      const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 4000 })
      parsed = extractJson(result.text)
    } catch (err) {
      const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao gerar o briefing visual.'
      await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'text_stage_error' })
      return json({ error: message, optionSetId }, 502)
    }

    const sharedBrief = parsed?.shared_brief
    const options: any[] = Array.isArray(parsed?.options) ? parsed.options : []
    const byLabel: Record<string, any> = {}
    for (const opt of options) if (opt?.label) byLabel[opt.label] = opt

    if (!sharedBrief || !byLabel.A || !byLabel.B || !byLabel.C) {
      await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'invalid_ai_response' })
      return json({ error: 'A IA retornou uma resposta em formato inesperado. Tente novamente.', optionSetId }, 502)
    }

    const referenceSnapshot = references.map((r) => ({ handle: r.handle }))
    await admin
      .from('visual_dna_option_sets')
      .update({ shared_brief: sharedBrief, reference_snapshot: referenceSnapshot })
      .eq('id', optionSetId)

    const { data: costRow } = await admin.from('ai_operation_costs').select('credit_cost').eq('generation_type', 'imagem').single()
    const perImageCost = (costRow?.credit_cost as number) ?? 15

    const { data: optionRows } = await admin.from('visual_dna_options').select('id, label').eq('option_set_id', optionSetId)
    const optionRowByLabel: Record<string, string> = {}
    for (const row of optionRows ?? []) optionRowByLabel[row.label as string] = row.id as string

    let anyTaskStarted = false
    const errors: Array<{ label: string; message: string }> = []

    for (const label of ['A', 'B', 'C']) {
      const opt = byLabel[label]
      const attributes = validateVisualDnaAttributes(opt?.attributes ?? {})
      const attributesSummary = typeof opt?.attributes_summary === 'string' ? opt.attributes_summary.slice(0, 300) : null
      const imagePrompt = typeof opt?.image_prompt === 'string' && opt.image_prompt.trim() ? opt.image_prompt.trim() : `${sharedBrief.theme}. ${sharedBrief.message}`
      const fullPrompt = `${imagePrompt}\n\n${ANTI_COPY_INSTRUCTION}`
      const rowId = optionRowByLabel[label]
      if (!rowId) continue

      try {
        const { data: generationRow, error: insertError } = await admin
          .from('ai_generations')
          .insert({
            workspace_id: workspaceId,
            user_id: userData.user.id,
            content_id: null,
            generation_type: 'imagem',
            theme_input: attributesSummary ?? sharedBrief.theme ?? 'Direção visual',
            brand_context_snapshot: brandProfile ?? {},
            provider: mediaProvider.name,
            model: 'gpt4o-image',
            status: 'processing',
            request_payload: { prompt: fullPrompt, size: '1:1', option_set_id: optionSetId, label },
            // Custo real por imagem só como referência de observabilidade —
            // o crédito de fato já foi cobrado (ou dispensado) uma única
            // vez pra rodada inteira em claim_visual_dna_generation.
            // credit_ledger_id fica null de propósito (ver migração
            // visual_dna_refund_on_total_failure): se apontasse pro ledger
            // do option_set, uma falha isolada desta imagem estornaria os
            // 45 créditos inteiros via refund_ai_generation_system.
            credit_cost: perImageCost,
          })
          .select()
          .single()
        if (insertError || !generationRow) throw new Error('Falha ao criar registro de geração.')

        const task = await mediaProvider.createTask({
          model: 'gpt4o-image',
          input: { prompt: fullPrompt, size: '1:1' },
          callbackUrl: `${supabaseUrl}/functions/v1/ai-webhook`,
        })
        await admin.from('ai_generations').update({ task_id: task.taskId }).eq('id', generationRow.id)

        await admin
          .from('visual_dna_options')
          .update({ attributes, attributes_summary: attributesSummary, ai_generation_id: generationRow.id })
          .eq('id', rowId)

        anyTaskStarted = true
      } catch (err) {
        const message = err instanceof ProviderRequestError ? err.message : err instanceof Error ? err.message : 'Erro inesperado.'
        errors.push({ label, message })
        await admin.from('visual_dna_options').update({ status: 'failed' }).eq('id', rowId)
      }
    }

    await admin.from('visual_dna_generation_runs').insert({
      workspace_id: workspaceId,
      option_set_id: optionSetId,
      images_attempted: 3,
      images_succeeded: 0,
      credit_cost: optionSet.credit_cost,
      errors,
      finished_at: errors.length === 3 ? new Date().toISOString() : null,
    })

    if (!anyTaskStarted) {
      await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'all_image_tasks_failed' })
      return json({ error: 'Não foi possível iniciar a geração das imagens.', optionSetId, errors }, 502)
    }

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'visual_dna_generation_started',
      p_resource_type: 'visual_dna_option_sets',
      p_resource_id: optionSetId,
      p_metadata: { round: optionSet.round_number, credit_cost: optionSet.credit_cost, errors },
    })

    return json({ optionSetId, roundNumber: optionSet.round_number, creditCost: optionSet.credit_cost, errors })
  } catch (err) {
    console.error('Erro inesperado em brand-visual-dna-generate', err)
    await userClient.rpc('fail_visual_dna_generation', { p_option_set_id: optionSetId, p_reason: 'unexpected_error' }).catch(() => {})
    return json({ error: 'Erro inesperado ao processar a solicitação.', optionSetId }, 500)
  }
})
