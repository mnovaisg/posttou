// Edge Function: Editor Visual (Fase 5) — inicia geração de imagem por IA
// (assíncrona). Toda a comunicação com o provedor passa pelo AI Gateway
// (_shared/ai-gateway) — nunca fala com a Kie.ai diretamente daqui nem do
// editor. O custo é decidido aqui a partir de ai_operation_costs; qualquer
// valor de custo enviado pelo cliente é ignorado.
//
// O resultado NÃO volta nesta resposta — a geração é assíncrona. O
// callback chega em ai-webhook, que transfere o resultado para o Storage
// próprio e marca a geração como concluída. O frontend faz polling da
// linha ai_generations (permitido por RLS) até status sair de 'processing'.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { brandProfileToPromptText } from '../_shared/ai-gateway/brand-context.ts'
import { ANTI_COPY_INSTRUCTION, referencesToPromptText, visualDnaToPromptText, type ReferenceForPrompt, type VisualDnaAttributes } from '../_shared/ai-gateway/visual-dna-context.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// A 4o-image só aceita '1:1' | '3:2' | '2:3'. Não existe correspondência
// exata para 4:5/9:16 — usamos o portrait mais próximo disponível
// (limitação real do provider, documentada no relatório da fase).
const KIE_SIZE_BY_FORMAT: Record<string, string> = {
  '1:1': '1:1',
  '4:5': '2:3',
  '9:16': '2:3',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let generationId: string | null = null
  let userClient: ReturnType<typeof createClient> | null = null

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Corpo da requisição inválido.' }, 400)

    const { workspaceId, contentId, prompt, format } = body as Record<string, unknown>

    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)
    if (typeof prompt !== 'string' || !prompt.trim()) return json({ error: 'prompt é obrigatório.' }, 400)
    if (prompt.length > 2000) return json({ error: 'prompt muito longo (máximo 2000 caracteres).' }, 400)
    const kieSize = KIE_SIZE_BY_FORMAT[typeof format === 'string' ? format : '1:1'] ?? '1:1'

    const { data: isMember, error: memberError } = await userClient.rpc('is_workspace_member', { p_workspace_id: workspaceId })
    if (memberError || !isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    // Fase 14C: gap real encontrado em auditoria — ai-generate-image nunca
    // tinha o gate de assinatura da Fase 14B, permitindo gerar imagem pelo
    // Editor mesmo com trial expirado/assinatura cancelada.
    const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
    if (!entitlement?.allowed) {
      return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
    }

    // Ajuste pré-beta: mesmo guard de check_brand_dna_ready usado em
    // ai-generate — geração de arte por IA também não deve rodar sem o
    // Brand DNA mínimo.
    const { data: brandDnaGate } = await admin.rpc('check_brand_dna_ready', { p_workspace_id: workspaceId })
    if (!brandDnaGate?.allowed) {
      return json({ error: 'brand_dna_required', reason: brandDnaGate?.reason ?? 'BRAND_DNA_REQUIRED' }, 412)
    }

    if (typeof contentId === 'string' && contentId) {
      const { data: content } = await admin.from('contents').select('workspace_id').eq('id', contentId).maybeSingle()
      if (!content || content.workspace_id !== workspaceId) {
        return json({ error: 'Conteúdo inválido para este workspace.' }, 400)
      }
    }

    let mediaProvider
    try {
      mediaProvider = getMediaProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return json(
          { error: 'not_configured', message: 'A geração de imagem por IA ainda não está configurada neste ambiente. Peça ao administrador para configurar KIE_API_KEY nas Edge Functions.' },
          501,
        )
      }
      throw err
    }

    const { data: costRow, error: costError } = await admin
      .from('ai_operation_costs')
      .select('credit_cost')
      .eq('generation_type', 'imagem')
      .single()
    if (costError || !costRow) return json({ error: 'Não foi possível determinar o custo desta operação.' }, 500)
    const creditCost = costRow.credit_cost as number

    const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle()
    const brandText = brandProfileToPromptText(brandProfile ?? null)

    // Fase 12: DNA visual confirmado + referências ativas — só quando
    // existirem (workspace pode nunca ter configurado nenhum dos dois).
    // Nunca enviado ao planner do Piloto (ajuste 8) — só aqui, no ponto
    // real de geração de imagem.
    const { data: activeVisualDna } = await admin
      .from('brand_visual_dna')
      .select('attributes')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()
    const visualDnaText = visualDnaToPromptText((activeVisualDna?.attributes ?? null) as VisualDnaAttributes | null)

    const { data: referenceRows } = await admin
      .from('brand_reference_profiles')
      .select('handle, reference_type, liked_aspects, notes, status, analysis')
      .eq('workspace_id', workspaceId)
      .is('removed_at', null)
    const referencesText = referencesToPromptText((referenceRows ?? []) as ReferenceForPrompt[])

    const contextBlocks = [
      brandProfile ? `Contexto da marca (use para guiar estilo/identidade visual quando relevante):\n${brandText}` : '',
      visualDnaText,
      referencesText,
    ].filter(Boolean)

    const fullPrompt = contextBlocks.length
      ? `${contextBlocks.join('\n\n')}\n\n${ANTI_COPY_INSTRUCTION}\n\nPedido do usuário: ${prompt}`
      : prompt

    const { data: generationRow, error: insertError } = await admin
      .from('ai_generations')
      .insert({
        workspace_id: workspaceId,
        user_id: userData.user.id,
        content_id: typeof contentId === 'string' ? contentId : null,
        generation_type: 'imagem',
        format: typeof format === 'string' ? format : null,
        theme_input: prompt,
        brand_context_snapshot: brandProfile ?? {},
        provider: mediaProvider.name,
        model: 'gpt4o-image',
        status: 'pending',
        request_payload: { prompt: fullPrompt, size: kieSize },
        credit_cost: creditCost,
      })
      .select()
      .single()
    if (insertError || !generationRow) {
      console.error('Falha ao criar registro de geração', insertError)
      return json({ error: 'Erro inesperado ao iniciar a geração.' }, 500)
    }
    generationId = generationRow.id as string

    const { data: ledgerRow, error: creditError } = await userClient.rpc('consume_credits', {
      p_workspace_id: workspaceId,
      p_amount: creditCost,
      p_operation: 'ai_generation',
      p_reference_type: 'ai_generations',
      p_reference_id: generationId,
    })
    if (creditError || !ledgerRow) {
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'insufficient_credits', error_message: 'Créditos insuficientes.', completed_at: new Date().toISOString() })
        .eq('id', generationId)
      return json({ error: creditError?.message ?? 'Saldo de créditos insuficiente.', creditCost }, 402)
    }

    await admin.from('ai_generations').update({ status: 'processing', credit_ledger_id: ledgerRow.id }).eq('id', generationId)

    try {
      const task = await mediaProvider.createTask({
        model: 'gpt4o-image',
        input: { prompt: fullPrompt, size: kieSize },
        callbackUrl: `${supabaseUrl}/functions/v1/ai-webhook`,
      })
      await admin.from('ai_generations').update({ task_id: task.taskId }).eq('id', generationId)

      await userClient.rpc('log_audit_event', {
        p_workspace_id: workspaceId,
        p_action: 'ia_geracao_imagem_iniciada',
        p_resource_type: 'ai_generations',
        p_resource_id: generationId,
        p_metadata: { credit_cost: creditCost, provider: mediaProvider.name, task_id: task.taskId },
      })

      return json({ generationId, taskId: task.taskId, creditCost, provider: mediaProvider.name })
    } catch (err) {
      const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao chamar o provedor de IA.'
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'provider_error', error_message: message, completed_at: new Date().toISOString() })
        .eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: message, generationId }, 502)
    }
  } catch (err) {
    console.error('Erro inesperado em ai-generate-image', err)
    if (generationId && userClient) {
      const admin = createClient(supabaseUrl, serviceRoleKey)
      const { data: current } = await admin.from('ai_generations').select('status, credit_ledger_id').eq('id', generationId).single()
      if (current && current.status !== 'success' && current.status !== 'failed') {
        await admin
          .from('ai_generations')
          .update({ status: 'failed', error_code: 'unexpected_error', error_message: 'Erro inesperado.', completed_at: new Date().toISOString() })
          .eq('id', generationId)
        if (current.credit_ledger_id) {
          await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId }).catch(() => {})
        }
      }
    }
    return json({ error: 'Erro inesperado ao processar a solicitação.' }, 500)
  }
})
