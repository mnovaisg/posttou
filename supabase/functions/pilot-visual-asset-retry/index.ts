// Fase 13 — "Tentar gerar arte novamente" (owner/admin, sempre disponível
// independente do toggle auto_generate_art — ação explícita do usuário).
// Nunca regenera o texto: só reivindica a página (idempotente contra
// duplo-clique via pilot_claim_visual_asset_manual_retry) e dispara uma
// nova tentativa reaproveitando o mesmo gerador compartilhado com o
// caminho automático (generatePilotVisualAsset).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { generatePilotVisualAsset } from '../_shared/ai-gateway/pilot-visual-asset.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
  const pageId = (body as Record<string, unknown> | null)?.pageId
  if (typeof pageId !== 'string' || !pageId) return json({ error: 'pageId é obrigatório.' }, 400)

  // Checa role + idempotência (só reivindica se status = 'failed').
  const { data: page, error: claimError } = await userClient.rpc('pilot_claim_visual_asset_manual_retry', { p_page_id: pageId })
  if (claimError || !page) {
    const message = claimError?.message ?? 'Não foi possível reivindicar esta página.'
    const status = message.includes('owner/admin') ? 403 : message.includes('não encontrada') ? 404 : 409
    return json({ error: message }, status)
  }

  const { data: content } = await admin.from('contents').select('id, workspace_id, title, caption').eq('id', page.content_id).single()
  if (!content) return json({ error: 'Conteúdo não encontrado.' }, 404)

  // Fase 14B: retry não consome franquia (a peça já existe), mas ainda é
  // uma operação paga (créditos) — bloqueada se a assinatura expirou.
  const { data: entitlement } = await admin.rpc('check_subscription_entitlement', { p_workspace_id: content.workspace_id })
  if (!entitlement?.allowed) {
    await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: pageId, p_reason: 'subscription_not_active' })
    return json({ error: 'subscription_required', reason: entitlement?.reason ?? 'SUBSCRIPTION_NOT_ACTIVE' }, 402)
  }

  let mediaProvider
  try {
    mediaProvider = getMediaProvider()
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: pageId, p_reason: 'ai_not_configured' })
      return json({ error: 'not_configured', message: 'A geração de imagem por IA ainda não está configurada neste ambiente.' }, 501)
    }
    throw err
  }

  const result = await generatePilotVisualAsset({
    admin,
    mediaProvider,
    supabaseUrl,
    workspaceId: content.workspace_id,
    pageId,
    contentId: content.id,
    contentContext: `Título: ${content.title}\nLegenda: ${content.caption ?? ''}`,
  })

  await userClient.rpc('log_audit_event', {
    p_workspace_id: content.workspace_id,
    p_action: 'pilot_visual_asset_retry_requested',
    p_resource_type: 'content_pages',
    p_resource_id: pageId,
    p_metadata: { ok: result.ok, error_code: result.errorCode },
  })

  if (!result.ok) return json({ error: result.errorMessage ?? result.errorCode ?? 'Falha ao gerar a arte.' }, 502)
  return json({ generationId: result.generationId })
})
