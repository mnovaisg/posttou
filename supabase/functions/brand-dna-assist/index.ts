// Edge Function: sugere preenchimento do DNA da Marca a partir de uma
// descrição curta fornecida pelo usuário. Nunca salva nada sozinha —
// devolve sugestões para o usuário revisar e aceitar campo a campo.
//
// Ajuste pré-beta: esta função chamava a Anthropic diretamente (resquício
// anterior à Fase 4/AI Gateway), sem passar por getTextProvider() como
// todo o resto do POSTTOU — corrigido para reaproveitar o AI Gateway
// compartilhado (_shared/ai-gateway). Nenhum provider paralelo.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'

const CREDIT_COST = 5

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

const SUGGESTION_SCHEMA_HINT = `Responda APENAS com um JSON válido, sem texto antes ou depois, no formato exato:
{
  "description": "string",
  "differentiators": "string",
  "problems_solved": "string",
  "audience": {
    "interests": ["string"],
    "needs": ["string"],
    "pains": ["string"],
    "desires": ["string"]
  },
  "content_strategy": {
    "priority_themes": ["string"],
    "objectives": ["vender" | "educar" | "autoridade" | "relacionamento" | "leads" | "alcance" | "engajamento" | "divulgar"]
  },
  "voice": {
    "personality_traits": ["string"]
  },
  "vocabulary": {
    "preferred_words": ["string"]
  }
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

    const { workspaceId, businessDescription } = await req.json()
    if (!workspaceId || !businessDescription || typeof businessDescription !== 'string') {
      return json({ error: 'workspaceId e businessDescription são obrigatórios.' }, 400)
    }
    if (businessDescription.length > 2000) {
      return json({ error: 'Descrição muito longa (máximo 2000 caracteres).' }, 400)
    }

    const { data: isMember } = await supabase.rpc('is_workspace_member', { p_workspace_id: workspaceId })
    if (!isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    // Fase 14C: gap real encontrado em auditoria — este endpoint consome
    // créditos mas nunca teve o gate de assinatura da Fase 14B.
    const { data: entitlement } = await supabase.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
    if (!entitlement?.allowed) {
      return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
    }

    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        // Nunca expor nome de provider/variável de ambiente ao usuário final.
        return json(
          { error: 'not_configured', message: 'O preenchimento com IA não está disponível no momento. Você pode continuar preenchendo manualmente.' },
          501,
        )
      }
      throw err
    }

    // Débito atômico de créditos ANTES da chamada de IA — se não houver
    // saldo, a função nem chega a gastar com a API externa.
    const { error: creditError } = await supabase.rpc('consume_credits', {
      p_workspace_id: workspaceId,
      p_amount: CREDIT_COST,
      p_operation: 'brand_dna_ai_assist',
      p_reference_type: 'brand_profiles',
    })
    if (creditError) {
      return json({ error: creditError.message ?? 'Saldo de créditos insuficiente.' }, 402)
    }

    const systemPrompt =
      'Você é um estrategista de marca. Com base na descrição de negócio informada pelo usuário (em português do Brasil), sugira o preenchimento do DNA de marca de um SaaS de conteúdo para Instagram.'
    const userPrompt = `Descrição do negócio: """${businessDescription}"""\n\n${SUGGESTION_SCHEMA_HINT}`

    let result
    try {
      result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 1024 })
    } catch (err) {
      console.error('brand-dna-assist: falha ao chamar o provedor de IA.', err instanceof ProviderRequestError ? err.message : err)
      return json({ error: 'Não conseguimos gerar as sugestões agora. Você pode tentar novamente em alguns instantes ou continuar preenchendo manualmente.' }, 502)
    }

    let suggestions: unknown
    try {
      const match = result.text.match(/\{[\s\S]*\}/)
      suggestions = JSON.parse(match ? match[0] : result.text)
    } catch {
      console.error('Falha ao parsear resposta da IA', result.text)
      return json({ error: 'Não conseguimos gerar as sugestões agora. Você pode tentar novamente em alguns instantes ou continuar preenchendo manualmente.' }, 502)
    }

    await supabase.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'ia_geracao',
      p_resource_type: 'brand_profiles',
      p_metadata: { feature: 'brand_dna_assist', credit_cost: CREDIT_COST },
    })

    return json({ suggestions })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro inesperado ao processar a solicitação.' }, 500)
  }
})
