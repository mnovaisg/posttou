// Etapa 3, Decisão 2 (Opção A) — interpreta em texto a arte que JÁ foi
// criada para o primeiro conteúdo do onboarding e confirma isso como a
// primeira direção visual da marca. NÃO gera imagem nova, NÃO cria uma
// rodada em visual_dna_option_sets (essa continua sendo o caminho real
// pra quando o usuário pedir "quero outra direção" — VisualDnaPage,
// inalterado). Só 1 chamada de texto barata, sem custo de crédito extra
// (o onboarding já cobrou 5+3+5+15=28 — este passo não soma mais nada).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { brandProfileToPromptText } from '../_shared/ai-gateway/brand-context.ts'
import { validateVisualDnaAttributes } from '../_shared/ai-gateway/visual-dna-context.ts'
import { buildVisualDnaInterpretationPrompt } from '../_shared/ai-gateway/visual-dna-prompt.ts'

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
  const contentContext = (body as Record<string, unknown> | null)?.contentContext
  const contentId = (body as Record<string, unknown> | null)?.contentId
  if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)
  if (typeof contentContext !== 'string' || !contentContext.trim()) return json({ error: 'contentContext é obrigatório.' }, 400)

  const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: workspaceId })
  if (!entitlement?.allowed) {
    return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
  }

  const { data: brandDnaGate } = await admin.rpc('check_brand_dna_ready', { p_workspace_id: workspaceId })
  if (!brandDnaGate?.allowed) {
    return json({ error: 'brand_dna_required', reason: brandDnaGate?.reason ?? 'BRAND_DNA_REQUIRED' }, 412)
  }

  let textProvider
  try {
    textProvider = getTextProvider()
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return json({ error: 'not_configured', message: 'A interpretação da direção visual ainda não está configurada neste ambiente.' }, 501)
    }
    throw err
  }

  const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle()
  const brandText = brandProfileToPromptText(brandProfile ?? null)

  const { systemPrompt, userPrompt } = buildVisualDnaInterpretationPrompt({ brandText, contentContext })

  let parsed: any
  try {
    const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 1500 })
    parsed = extractJson(result.text)
  } catch (err) {
    const message = err instanceof ProviderRequestError ? err.message : 'Não conseguimos interpretar a direção visual agora.'
    return json({ error: message }, 502)
  }

  const rawAttributes = parsed?.attributes
  if (!rawAttributes || typeof rawAttributes !== 'object') {
    return json({ error: 'A IA retornou uma resposta em formato inesperado. Tente novamente.' }, 502)
  }
  const attributes = validateVisualDnaAttributes(rawAttributes)
  const attributesSummary = typeof parsed?.attributes_summary === 'string' ? parsed.attributes_summary.slice(0, 300) : null

  const { data: confirmed, error: confirmError } = await userClient.rpc('confirm_visual_dna_from_content', {
    p_workspace_id: workspaceId,
    p_attributes: attributes,
    p_based_on_content_id: typeof contentId === 'string' ? contentId : null,
  })
  if (confirmError || !confirmed) {
    return json({ error: confirmError?.message ?? 'Não foi possível confirmar o DNA visual.' }, 400)
  }

  return json({ attributes, attributesSummary, brandVisualDna: confirmed })
})
