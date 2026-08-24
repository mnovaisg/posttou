// Edge Function: "Explicar melhor" (Fase 10) — único caminho de Performance
// que consome crédito do cliente (ajuste 6). Chamado pelo usuário
// autenticado a partir do dashboard de Performance, nunca automaticamente.
// Mesmo padrão de débito de ai-generate/index.ts: custo relido do servidor
// (ai_operation_costs), nunca confiado do cliente; débito ANTES de chamar
// o provedor; estorno em qualquer falha.
//
// Mesma garantia anti-número-inventado do gerador automático: a IA só
// escreve com placeholders {{chave}} resolvidos a partir dos facts
// determinísticos — texto com número fora de uma substituição é rejeitado.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let generationId: string | null = null

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

    const body = await req.json().catch(() => null)
    const { workspaceId, periodDays } = (body ?? {}) as Record<string, unknown>
    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)
    const period = typeof periodDays === 'number' && periodDays > 0 && periodDays <= 90 ? periodDays : 30

    const { data: isMember } = await userClient.rpc('is_workspace_member', { p_workspace_id: workspaceId })
    if (!isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    // Fase 14C: gap real encontrado em auditoria — este endpoint consome
    // créditos mas nunca teve o gate de assinatura da Fase 14B.
    const { data: entitlement } = await userClient.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
    if (!entitlement?.allowed) {
      return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
    }

    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        return json({ error: 'not_configured', message: 'A geração com IA ainda não está configurada neste ambiente.' }, 501)
      }
      throw err
    }

    const { data: costRow, error: costError } = await admin.from('ai_operation_costs').select('credit_cost').eq('generation_type', 'performance_insight').single()
    if (costError || !costRow) return json({ error: 'Não foi possível determinar o custo desta operação.' }, 500)
    const creditCost = costRow.credit_cost as number

    const { data: facts, error: factsError } = await userClient.rpc('compute_performance_facts', { p_workspace_id: workspaceId, p_period_days: period })
    if (factsError || !facts) return json({ error: 'Não há dados de performance suficientes ainda.' }, 404)

    const { data: generationRow, error: genInsertError } = await admin
      .from('ai_generations')
      .insert({
        workspace_id: workspaceId,
        user_id: userData.user.id,
        generation_type: 'performance_insight',
        theme_input: 'explicacao_manual_performance',
        status: 'pending',
        provider: textProvider.name,
        model: 'pending',
        request_payload: { period_days: period, automatic: false, billed: true },
        credit_cost: creditCost,
      })
      .select('id')
      .single()
    if (genInsertError || !generationRow) {
      console.error('performance-insight-explain: falha ao inserir ai_generations.', genInsertError)
      return json({ error: 'Erro inesperado ao iniciar a explicação.' }, 500)
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
      await admin.from('ai_generations').update({ status: 'failed', error_code: 'insufficient_credits', error_message: 'Créditos insuficientes.', completed_at: new Date().toISOString() }).eq('id', generationId)
      return json({ error: creditError?.message ?? 'Saldo de créditos insuficiente.', creditCost }, 402)
    }
    await admin.from('ai_generations').update({ status: 'processing', credit_ledger_id: ledgerRow.id }).eq('id', generationId)

    const placeholders: Record<string, string> = {}
    const flatten = (prefix: string, obj: Record<string, unknown> | null) => {
      if (!obj) return
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) continue
        placeholders[`${prefix}.${k}`] = String(v)
      }
    }
    const f = facts as Record<string, unknown>
    flatten('overall', f.overall as Record<string, unknown>)
    if (f.best_format) flatten('best_format', f.best_format as Record<string, unknown>)
    if (f.best_editorial_role) flatten('best_editorial_role', f.best_editorial_role as Record<string, unknown>)
    if (f.best_origin) flatten('best_origin', f.best_origin as Record<string, unknown>)

    const systemPrompt =
      'Você é um analista de performance de conteúdo no Instagram, explicando os dados de um workspace pro dono do negócio, em português do Brasil, tom direto e útil. ' +
      'Você NUNCA escreve números diretamente — todo número é um placeholder {{chave}}, usando EXATAMENTE uma chave da lista fornecida. Nunca invente uma chave. ' +
      'Nunca afirme causalidade (ex.: "X causou Y") — só correlação, e diga explicitamente quando a amostra é pequena. ' +
      'Responda apenas com um JSON válido: {"title": "string curta", "description": "3-5 frases explicando os padrões e o que eles sugerem, usando placeholders para os números"}.'
    const userPrompt = `Fatos determinísticos do período (${f.period_start} a ${f.period_end}):\n${JSON.stringify(facts)}\n\nPlaceholders disponíveis: ${Object.keys(placeholders).join(', ')}`

    let result
    try {
      result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 600 })
    } catch (err) {
      const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao chamar o provedor de IA.'
      await admin.from('ai_generations').update({ status: 'failed', error_code: 'provider_error', error_message: message, completed_at: new Date().toISOString() }).eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: message }, 502)
    }

    let parsed: { title?: string; description?: string }
    try {
      const match = result.text.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : result.text)
      if (!parsed.title || !parsed.description) throw new Error('Resposta sem title/description.')
    } catch (err) {
      await admin.from('ai_generations').update({ status: 'failed', error_code: 'invalid_response', error_message: err instanceof Error ? err.message : 'JSON inválido.', completed_at: new Date().toISOString() }).eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: 'A IA retornou uma resposta inválida.' }, 502)
    }

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
    const hasStrayDigits = (raw: string) => /\d/.test(raw.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g, ''))

    const title = substitute(parsed.title)
    const description = substitute(parsed.description)
    if (!title.ok || !description.ok || hasStrayDigits(parsed.title) || hasStrayDigits(parsed.description)) {
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'unsafe_output', error_message: 'IA tentou usar número ou placeholder fora dos facts fornecidos.', completed_at: new Date().toISOString() })
        .eq('id', generationId)
      await userClient.rpc('refund_failed_ai_generation', { p_generation_id: generationId })
      return json({ error: 'A explicação gerada não pôde ser validada com segurança. Tente novamente.' }, 502)
    }

    await admin.from('ai_generations').update({ status: 'success', model: result.model, result_text: `${title.text}\n${description.text}`, completed_at: new Date().toISOString() }).eq('id', generationId)
    await admin.rpc('log_audit_event', { p_workspace_id: workspaceId, p_action: 'performance_insight_generated', p_resource_type: 'ai_generations', p_resource_id: generationId, p_metadata: { manual: true } })

    return json({ title: title.text, description: description.text, generationId, creditCost, facts })
  } catch (err) {
    console.error('performance-insight-explain: erro inesperado.', err)
    if (generationId) {
      const admin = createClient(supabaseUrl, serviceRoleKey)
      await admin.from('ai_generations').update({ status: 'failed', error_code: 'internal_error', error_message: err instanceof Error ? err.message : 'Erro desconhecido.', completed_at: new Date().toISOString() }).eq('id', generationId)
    }
    return json({ error: 'Erro inesperado ao gerar a explicação.' }, 500)
  }
})
