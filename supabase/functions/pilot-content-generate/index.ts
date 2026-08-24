// Edge Function: gera os conteúdos de um plano aprovado (Fase 9).
// Reaproveita integralmente o AI Gateway da Fase 4 (buildPrompt,
// getTextProvider, ai_generations, ai_operation_costs) — não existe um
// "pilot-ai-generator" com prompt/lógica de geração paralela. Só o
// wrapper de autenticação/orquestração é próprio, porque este caminho
// não tem sessão de usuário (cron) e precisa das variantes "_system" das
// RPCs de crédito/transição.
//
// Ajuste 2 da aprovação: calcula o custo total do lote ANTES de
// reivindicar qualquer item. Se insuficiente, NENHUM item é gerado.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { buildPrompt, type GenerationType, type HistoryItem } from '../_shared/ai-gateway/prompts.ts'
import { generatePilotVisualAsset } from '../_shared/ai-gateway/pilot-visual-asset.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-posttou-cron-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text)
}

// deno-lint-ignore no-explicit-any
async function refundGenerationBestEffort(admin: any, generationId: string) {
  // .rpc() do supabase-js é "thenable", não uma Promise real — nunca tem
  // .catch() encadeável; precisa de try/catch ao redor do await.
  try {
    await admin.rpc('refund_ai_generation_system', { p_generation_id: generationId })
  } catch (e) {
    console.error('pilot-content-generate: falha ao estornar geração.', e)
  }
}

const FORMAT_TO_GENERATION_TYPE: Record<string, GenerationType> = { post: 'post_unico', carrossel: 'carrossel' }
const ROLE_TO_OBJECTIVE: Record<string, string> = { educativo: 'educar', autoridade: 'autoridade', relacionamento: 'relacionamento', venda: 'vender' }
const DIMS = { width: 1080, height: 1350 } // '4:5' — único formato usado pelo Piloto (post/carrossel)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const body = await req.json().catch(() => null)
  const planId = (body as Record<string, unknown> | null)?.planId as string | undefined
  if (!planId) return json({ error: 'missing_params', message: 'planId é obrigatório.' }, 400)

  const cronSecret = Deno.env.get('PILOT_WORKER_SECRET')
  const isInternalCaller = !!cronSecret && req.headers.get('x-posttou-cron-secret') === cronSecret

  const { data: plan } = await admin.from('pilot_plans').select('*').eq('id', planId).single()
  if (!plan) return json({ error: 'not_found', message: 'Plano não encontrado.' }, 404)

  if (!isInternalCaller) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)
    const { data: isOwnerAdmin } = await userClient.rpc('has_workspace_role', { p_workspace_id: plan.workspace_id, p_roles: ['owner', 'admin'] })
    if (!isOwnerAdmin) return json({ error: 'forbidden', message: 'Só owner/admin pode iniciar a geração de conteúdo.' }, 403)
  }

  // Fase 14B, decisão 7: Piloto verifica a franquia (e o status da
  // assinatura) ANTES de começar a criar automaticamente — evita queimar
  // chamadas de IA para itens que vão falhar de qualquer forma no gate de
  // public.contents. A proteção definitiva contra concorrência continua
  // sendo o trigger enforce_content_franchise_gate (advisory lock), não
  // esta checagem — esta é só uma otimização para não desperdiçar custo.
  const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: plan.workspace_id })
  if (!entitlement?.allowed) {
    return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
  }
  const { data: entitlementDetail } = await admin.rpc('get_workspace_entitlements', { p_workspace_id: plan.workspace_id })
  if (typeof entitlementDetail?.content_remaining_this_period === 'number' && entitlementDetail.content_remaining_this_period <= 0) {
    return json({ error: 'franchise_limit_reached', message: 'Franquia de conteúdos do plano esgotada neste período.' }, 402)
  }

  const startedAt = Date.now()
  const { data: run } = await admin.from('pilot_runs').insert({ workspace_id: plan.workspace_id, run_type: 'content_generation', status: 'running', plan_id: planId }).select('id').single()

  let itemsClaimed = 0
  let contentsGenerated = 0
  let aiCalls = 0
  let creditsConsumed = 0
  const usage = { input_tokens: 0, output_tokens: 0 }
  // deno-lint-ignore no-explicit-any
  let mediaProviderCache: any = null

  try {
    if (plan.status === 'approved') {
      const { error: startError } = await admin.rpc('start_pilot_generation', { p_plan_id: planId })
      if (startError) {
        await admin
          .from('pilot_runs')
          .update({ status: 'failed', error_summary: `start_pilot_generation: ${startError.message ?? JSON.stringify(startError)}`, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
          .eq('id', run!.id)
        return json({ error: 'start_generation_failed', message: startError.message, detail: startError }, 500)
      }
    } else if (plan.status !== 'generating') {
      await admin.from('pilot_runs').update({ status: 'failed', error_summary: `plan_status_${plan.status}`, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', run!.id)
      return json({ error: 'invalid_state', message: `Plano precisa estar aprovado (status atual: ${plan.status}).` }, 409)
    }

    // ── ajuste 2: custo total do lote calculado ANTES de reivindicar item algum ──
    const { data: needed } = await admin.rpc('pilot_estimate_batch_cost', { p_plan_id: planId })
    if (needed && needed > 0) {
      const { data: budget } = await admin.rpc('pilot_check_budget', { p_workspace_id: plan.workspace_id, p_plan_id: planId, p_needed: needed })
      if (!budget?.sufficient) {
        // Insert direto (não log_audit_event) — service_role bypassa RLS de audit_logs
        // sem precisar de outro marcador de sistema só para este evento pontual.
        await admin.from('audit_logs').insert({
          workspace_id: plan.workspace_id,
          user_id: null,
          action: 'pilot_insufficient_credits',
          resource_type: 'pilot_plans',
          resource_id: planId,
          metadata: { ...budget, actor: 'pilot_worker' },
        })
        await admin
          .from('pilot_runs')
          .update({ status: 'failed', error_summary: 'insufficient_credits', estimated_ai_cost: budget, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
          .eq('id', run!.id)
        return json({ error: 'insufficient_credits', message: `Créditos insuficientes: necessário ${needed}, disponível ${budget?.available ?? 0}.`, budget }, 402)
      }
    }

    const { data: claimedItems } = await admin.rpc('claim_pilot_plan_items_for_generation', { p_plan_id: planId, p_limit: 20 })
    itemsClaimed = claimedItems?.length ?? 0

    const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', plan.workspace_id).maybeSingle()
    const { data: recentContents } = await admin
      .from('contents')
      .select('title, caption, type, created_at')
      .eq('workspace_id', plan.workspace_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15)
    const history = (recentContents ?? []) as HistoryItem[]

    let textProvider;
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        for (const item of claimedItems ?? []) {
          await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: 'ai_not_configured' })
        }
        await admin.from('pilot_runs').update({ status: 'failed', error_summary: 'ai_not_configured', items_created: itemsClaimed, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', run!.id)
        return json({ error: 'not_configured' }, 501)
      }
      throw err
    }

    for (const item of claimedItems ?? []) {
      // item 44: pausa observada antes de CADA item — nenhum novo item começa depois que o Piloto foi pausado.
      const { data: liveSettings } = await admin.from('pilot_settings').select('status, auto_generate_art').eq('workspace_id', plan.workspace_id).single()
      if (liveSettings?.status !== 'active') {
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'skipped', p_reason: 'pilot_paused' })
        continue
      }

      // ajuste 4: revalida o slot imediatamente antes de gerar — manual sempre vence.
      const { data: conflict } = await admin.rpc('pilot_check_slot_conflict', { p_workspace_id: plan.workspace_id, p_scheduled_for: item.scheduled_for, p_exclude_plan_item_id: item.id })
      if (conflict) {
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'skipped', p_reason: 'slot_conflict' })
        continue
      }

      const generationType = FORMAT_TO_GENERATION_TYPE[item.format]
      if (!generationType) {
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: `format_not_supported:${item.format}` })
        continue
      }

      const { data: costRow } = await admin.from('ai_operation_costs').select('credit_cost').eq('generation_type', generationType).single()
      const creditCost = costRow?.credit_cost as number

      const themeInput = [item.topic, item.angle, item.radar_opportunity_id ? 'Não copie o conteúdo de origem. Crie uma abordagem original.' : null].filter(Boolean).join('\n\n')
      const { systemPrompt, userPrompt } = buildPrompt({
        generationType,
        objective: ROLE_TO_OBJECTIVE[item.editorial_role],
        format: '4:5',
        themeInput,
        brandProfile: brandProfile ?? null,
        history,
      })

      const { data: generationRow, error: genInsertError } = await admin
        .from('ai_generations')
        .insert({
          workspace_id: plan.workspace_id,
          user_id: null,
          generation_type: generationType,
          objective: ROLE_TO_OBJECTIVE[item.editorial_role],
          format: '4:5',
          theme_input: themeInput,
          brand_context_snapshot: brandProfile ?? {},
          history_snapshot: history,
          provider: textProvider.name,
          model: 'pending',
          status: 'pending',
          request_payload: { systemPrompt, userPrompt, pilot_plan_item_id: item.id },
          credit_cost: creditCost,
        })
        .select('id')
        .single()
      if (genInsertError || !generationRow) {
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: 'ai_generation_insert_failed' })
        continue
      }
      const generationId = generationRow.id as string
      aiCalls += 1

      const { data: ledgerRow, error: creditError } = await admin.rpc('consume_credits_system', {
        p_workspace_id: plan.workspace_id,
        p_amount: creditCost,
        p_operation: 'ai_generation',
        p_reference_type: 'ai_generations',
        p_reference_id: generationId,
        p_metadata: { pilot_plan_item_id: item.id },
      })
      if (creditError || !ledgerRow) {
        await admin.from('ai_generations').update({ status: 'failed', error_code: 'insufficient_credits', completed_at: new Date().toISOString() }).eq('id', generationId)
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: 'insufficient_credits' })
        continue
      }
      await admin.from('ai_generations').update({ status: 'processing', credit_ledger_id: ledgerRow.id }).eq('id', generationId)
      creditsConsumed += creditCost

      let result
      try {
        result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 3000 })
      } catch (err) {
        const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao chamar o provedor de IA.'
        await admin.from('ai_generations').update({ status: 'failed', error_code: 'provider_error', error_message: message, completed_at: new Date().toISOString() }).eq('id', generationId)
        await refundGenerationBestEffort(admin, generationId)
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: message })
        continue
      }
      usage.input_tokens += result.usage?.inputTokens ?? 0
      usage.output_tokens += result.usage?.outputTokens ?? 0

      let parsed: any
      try {
        parsed = extractJson(result.text)
      } catch {
        await admin.from('ai_generations').update({ status: 'failed', error_code: 'invalid_response', result_text: result.text, model: result.model, completed_at: new Date().toISOString() }).eq('id', generationId)
        await refundGenerationBestEffort(admin, generationId)
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: 'invalid_ai_response' })
        continue
      }

      await admin.from('ai_generations').update({ status: 'success', result_payload: parsed, result_text: result.text, model: result.model, completed_at: new Date().toISOString() }).eq('id', generationId)

      const title = item.topic.length > 60 ? `${item.topic.slice(0, 57)}...` : item.topic
      // RPC dedicada (não .from('contents').insert direto): o trigger de
      // auditoria de INSERT em contents chama log_audit_event, que exige
      // o marcador posttou.system_actor='pilot_worker' NA MESMA transação
      // do INSERT — set_config de uma chamada REST anterior não persiste.
      const { data: content, error: contentError } = await admin.rpc('pilot_create_content', {
        p_workspace_id: plan.workspace_id,
        p_type: item.format,
        p_format: '4:5',
        p_title: title,
        p_caption: parsed.caption,
        p_hashtags: parsed.hashtags ?? [],
        p_cta: parsed.cta ?? null,
        p_pilot_plan_item_id: item.id,
      })
      if (contentError || !content) {
        // A geração já foi cobrada e teve sucesso — sem isso, o crédito
        // fica perdido (consumido, sem conteúdo entregue).
        await admin.from('ai_generations').update({ status: 'failed', error_code: 'content_insert_failed', completed_at: new Date().toISOString() }).eq('id', generationId)
        await refundGenerationBestEffort(admin, generationId)
        await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'failed', p_reason: 'content_insert_failed' })
        continue
      }

      await admin.from('ai_generations').update({ content_id: content.id }).eq('id', generationId)

      // Fase 13: cada página guarda seu texto (z_index 1) — quando a arte
      // automática estiver ligada, a imagem entra por baixo (z_index 0),
      // full-bleed, exatamente como o fluxo manual do Editor já monta um
      // elemento 'image' (ajuste 9: mesma estrutura, só muda quem chama).
      const createdPages: { id: string; slideText: string }[] = []
      if ('slides' in parsed && Array.isArray(parsed.slides) && parsed.slides.length) {
        for (let i = 0; i < parsed.slides.length; i++) {
          const { data: page } = await admin.from('content_pages').insert({ content_id: content.id, position: i, width: DIMS.width, height: DIMS.height }).select('id').single()
          if (page) {
            await admin.from('content_elements').insert({
              page_id: page.id,
              type: 'text',
              position_x: 80,
              position_y: 80,
              width: DIMS.width - 160,
              height: DIMS.height - 160,
              z_index: 1,
              content: { text: parsed.slides[i] },
            })
            createdPages.push({ id: page.id, slideText: parsed.slides[i] })
          }
        }
      } else {
        const { data: page } = await admin.from('content_pages').insert({ content_id: content.id, position: 0, width: DIMS.width, height: DIMS.height }).select('id').single()
        if (page) createdPages.push({ id: page.id, slideText: parsed.caption ?? title })
      }

      if (item.radar_opportunity_id) {
        // .rpc() do supabase-js é "thenable", não uma Promise real — não
        // tem .catch(); precisa de try/catch ao redor do await.
        try {
          await admin.rpc('link_radar_opportunity_content', { p_opportunity_id: item.radar_opportunity_id, p_content_id: content.id })
        } catch (e) {
          console.error('pilot-content-generate: falha ao vincular oportunidade do Radar.', e)
        }
      }

      if (liveSettings.auto_generate_art && createdPages.length) {
        // Ajuste 11: NUNCA espera a imagem terminar — só dispara a(s)
        // tarefa(s) e segue pro próximo item. O conteúdo só entra em
        // 'em_revisao' quando TODAS as páginas resolverem (trigger
        // sync_content_page_visual_asset / pilot_mark_visual_asset_failed
        // no bookkeeping.ts) — nunca aqui.
        let mediaProvider
        try {
          mediaProvider = mediaProviderCache ?? getMediaProvider()
          mediaProviderCache = mediaProvider
        } catch (err) {
          if (err instanceof ProviderNotConfiguredError) {
            for (const page of createdPages) {
              await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: page.id, p_reason: 'ai_not_configured' })
            }
            await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'generated', p_content_id: content.id })
            contentsGenerated += 1
            continue
          }
          throw err
        }

        for (const page of createdPages) {
          await generatePilotVisualAsset({
            admin,
            mediaProvider,
            supabaseUrl,
            workspaceId: plan.workspace_id,
            pageId: page.id,
            contentId: content.id,
            contentContext: `Título: ${title}\nLegenda: ${parsed.caption ?? ''}\nTrecho desta página: ${page.slideText}`,
          })
        }
      } else {
        // item 4/99: único caminho para sair de "rascunho" — nunca aprova, agenda ou publica.
        await admin.rpc('pilot_submit_content_for_review', { p_content_id: content.id })
      }

      await admin.rpc('resolve_pilot_plan_item', { p_item_id: item.id, p_outcome: 'generated', p_content_id: content.id })
      contentsGenerated += 1
    }

    const finalStatus = contentsGenerated === itemsClaimed ? 'success' : contentsGenerated > 0 ? 'partial_failure' : itemsClaimed === 0 ? 'success' : 'failed'

    await admin
      .from('pilot_runs')
      .update({
        status: finalStatus,
        items_created: itemsClaimed,
        contents_generated: contentsGenerated,
        ai_calls: aiCalls,
        credits_consumed: creditsConsumed,
        estimated_ai_cost: usage,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run!.id)

    return json({ planId, itemsClaimed, contentsGenerated, creditsConsumed })
  } catch (err) {
    console.error('pilot-content-generate: erro inesperado.', err)
    if (run) {
      await admin
        .from('pilot_runs')
        .update({ status: 'failed', error_summary: err instanceof Error ? err.message : 'Erro inesperado.', finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
        .eq('id', run.id)
    }
    return json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
