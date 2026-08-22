// Edge Function: sugere preenchimento do DNA da Marca a partir de uma
// descrição curta fornecida pelo usuário. Nunca salva nada sozinha —
// devolve sugestões para o usuário revisar e aceitar campo a campo.
//
// Depende de configuração externa: variável de ambiente ANTHROPIC_API_KEY
// (Supabase Edge Function secret). Sem ela, responde 501 de forma clara,
// em vez de simular uma resposta de IA.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return json(
        {
          error: 'not_configured',
          message:
            'O preenchimento com IA ainda não está configurado neste ambiente. Peça ao administrador para configurar a variável ANTHROPIC_API_KEY nas Edge Functions do Supabase.',
        },
        501,
      )
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

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Você é um estrategista de marca. Com base nesta descrição de negócio em português do Brasil, sugira o preenchimento do DNA de marca de um SaaS de conteúdo para Instagram.\n\nDescrição do negócio: """${businessDescription}"""\n\n${SUGGESTION_SCHEMA_HINT}`,
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text()
      console.error('Anthropic API error', anthropicRes.status, detail)
      return json({ error: 'Não foi possível gerar sugestões agora. Tente novamente em instantes.' }, 502)
    }

    const anthropicJson = await anthropicRes.json()
    const text = anthropicJson?.content?.[0]?.text ?? ''

    let suggestions: unknown
    try {
      const match = text.match(/\{[\s\S]*\}/)
      suggestions = JSON.parse(match ? match[0] : text)
    } catch {
      console.error('Falha ao parsear resposta da IA', text)
      return json({ error: 'A IA retornou uma resposta em formato inesperado. Tente novamente.' }, 502)
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
