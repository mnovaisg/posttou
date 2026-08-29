// Edge Function: Criar com IA (Fase 4) — geração de texto síncrona
// (post único, carrossel, roteiro de reels, legenda, ideias de conteúdo).
//
// Toda a comunicação com o provedor de IA passa pelo AI Gateway
// (_shared/ai-gateway) — esta função nunca fala com a Kie.ai diretamente.
// O custo em créditos é decidido aqui, a partir da tabela
// ai_operation_costs; qualquer valor de custo enviado pelo cliente é
// ignorado. Sem KIE_API_KEY configurada, retorna 501 — nunca simula uma
// resposta de IA.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { buildPrompt, type GenerationType, type HistoryItem } from '../_shared/ai-gateway/prompts.ts'

const GENERATION_TYPES: GenerationType[] = ['post_unico', 'carrossel', 'reels_roteiro', 'legenda', 'ideias_conteudo', 'ideias_onboarding']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text)
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

    const { workspaceId, generationType, objective, format, themeInput, contentId } = body as Record<string, unknown>

    if (typeof workspaceId !== 'string' || !workspaceId) {
      return json({ error: 'workspaceId é obrigatório.' }, 400)
    }
    if (typeof generationType !== 'string' || !GENERATION_TYPES.includes(generationType as GenerationType)) {
      return json({ error: `generationType deve ser um de: ${GENERATION_TYPES.join(', ')}.` }, 400)
    }
    if (typeof themeInput !== 'string' || !themeInput.trim()) {
      return json({ error: 'themeInput (tema/intenção) é obrigatório.' }, 400)
    }
    if (themeInput.length > 2000) {
      return json({ error: 'themeInput muito longo (máximo 2000 caracteres).' }, 400)
    }

    // Nota deliberada: nunca lemos body.creditCost / body.cost / qualquer
    // campo de preço vindo do cliente. O custo é sempre relido do banco
    // abaixo — mesmo que o payload contenha um desses campos, é ignorado.

    const { data: isMember, error: memberError } = await userClient.rpc('is_workspace_member', {
      p_workspace_id: workspaceId,
    })
    if (memberError || !isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    // Fase 14B: gate server-side de assinatura — nunca confiar só no
    // frontend. Bloqueia toda nova geração paga quando trial/assinatura
    // expirou ou foi cancelada.
    const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
    if (!entitlement?.allowed) {
      return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
    }

    // Ajuste pré-beta: geração de conteúdo por IA nunca deve rodar sem o
    // Brand DNA mínimo — o frontend já orienta para isso, mas o guard real
    // é aqui (auditoria encontrou os 4 caminhos reais sem nenhuma checagem).
    const { data: brandDnaGate } = await admin.rpc('check_brand_dna_ready', { p_workspace_id: workspaceId })
    if (!brandDnaGate?.allowed) {
      return json({ error: 'brand_dna_required', reason: brandDnaGate?.reason ?? 'BRAND_DNA_REQUIRED' }, 412)
    }

    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return json(
          {
            error: 'not_configured',
            message:
              'A geração com IA ainda não está configurada neste ambiente. Peça ao administrador para configurar a variável KIE_API_KEY nas Edge Functions do Supabase.',
          },
          501,
        )
      }
      throw err
    }

    const { data: costRow, error: costError } = await admin
      .from('ai_operation_costs')
      .select('credit_cost')
      .eq('generation_type', generationType)
      .single()
    if (costError || !costRow) {
      console.error('Custo não encontrado para generationType', generationType, costError)
      return json({ error: 'Não foi possível determinar o custo desta operação.' }, 500)
    }
    const creditCost = costRow.credit_cost as number

    const { data: brandProfile } = await admin
      .from('brand_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    const { data: recentContents } = await admin
      .from('contents')
      .select('title, caption, type, created_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15)

    const history = (recentContents ?? []) as HistoryItem[]

    const { systemPrompt, userPrompt } = buildPrompt({
      generationType: generationType as GenerationType,
      objective: typeof objective === 'string' ? objective : undefined,
      format: typeof format === 'string' ? format : undefined,
      themeInput,
      brandProfile: brandProfile ?? null,
      history,
    })

    const { data: generationRow, error: insertError } = await admin
      .from('ai_generations')
      .insert({
        workspace_id: workspaceId,
        user_id: userData.user.id,
        content_id: typeof contentId === 'string' ? contentId : null,
        generation_type: generationType,
        objective: typeof objective === 'string' ? objective : null,
        format: typeof format === 'string' ? format : null,
        theme_input: themeInput,
        brand_context_snapshot: brandProfile ?? {},
        history_snapshot: history,
        provider: textProvider.name,
        model: 'pending',
        status: 'pending',
        request_payload: { systemPrompt, userPrompt },
        credit_cost: creditCost,
      })
      .select()
      .single()
    if (insertError || !generationRow) {
      console.error('Falha ao criar registro de geração', insertError)
      return json({ error: 'Erro inesperado ao iniciar a geração.' }, 500)
    }
    generationId = generationRow.id as string

    // Débito atômico ANTES de chamar o provedor. Se o saldo for
    // insuficiente, a função nem chega a gastar com a chamada externa
    // (mesmo padrão de brand-dna-assist). consume_credits usa lock de
    // linha (SELECT ... FOR UPDATE), então duas gerações concorrentes são
    // serializadas corretamente: só uma debita se o saldo cobrir apenas uma.
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

    await admin
      .from('ai_generations')
      .update({ status: 'processing', credit_ledger_id: ledgerRow.id })
      .eq('id', generationId)

    let result
    try {
      result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 3000 })
    } catch (err) {
      const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao chamar o provedor de IA.'
      const status = err instanceof ProviderRequestError && err.status ? err.status : 500
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'provider_error', error_message: message, completed_at: new Date().toISOString() })
        .eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: message, generationId }, status >= 400 && status < 600 ? status : 502)
    }

    let parsed: unknown
    try {
      parsed = extractJson(result.text)
    } catch {
      await admin
        .from('ai_generations')
        .update({
          status: 'failed',
          error_code: 'invalid_response',
          error_message: 'A IA retornou uma resposta em formato inesperado.',
          result_text: result.text,
          model: result.model,
          completed_at: new Date().toISOString(),
        })
        .eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: 'A IA retornou uma resposta em formato inesperado. Tente novamente.', generationId }, 502)
    }

    await admin
      .from('ai_generations')
      .update({
        status: 'success',
        result_payload: parsed,
        result_text: result.text,
        model: result.model,
        completed_at: new Date().toISOString(),
      })
      .eq('id', generationId)

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'ia_geracao',
      p_resource_type: 'ai_generations',
      p_resource_id: generationId,
      p_metadata: { generation_type: generationType, credit_cost: creditCost, provider: textProvider.name },
    })

    return json({ generationId, result: parsed, creditCost, provider: textProvider.name, model: result.model })
  } catch (err) {
    console.error('Erro inesperado em ai-generate', err)
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
