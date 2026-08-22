// Edge Function: fallback de polling para geração de imagem por IA.
// O caminho principal é o webhook (ai-webhook); esta função existe porque
// entrega de webhook não é garantida (rede, configuração, etc.) — o
// frontend chama isto periodicamente enquanto a geração está 'processing'
// para não deixar o usuário preso caso o callback nunca chegue. Usa a
// mesma lógica de conclusão do webhook (completeImageGeneration), então o
// resultado final é idêntico nos dois caminhos.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { completeImageGeneration } from '../_shared/ai-gateway/complete-image-generation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

    const body = await req.json().catch(() => null)
    const generationId = (body as Record<string, unknown> | null)?.generationId
    if (typeof generationId !== 'string' || !generationId) return json({ error: 'generationId é obrigatório.' }, 400)

    const { data: generation } = await admin.from('ai_generations').select('*').eq('id', generationId).maybeSingle()
    if (!generation) return json({ error: 'Geração não encontrada.' }, 404)

    // RLS não se aplica ao client admin — checamos membership manualmente.
    const { data: isMember } = await userClient.rpc('is_workspace_member', { p_workspace_id: generation.workspace_id })
    if (!isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    if (generation.status !== 'processing') {
      return json({ status: generation.status, resultAssetPaths: generation.result_asset_paths, errorMessage: generation.error_message })
    }

    let mediaProvider
    try {
      mediaProvider = getMediaProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) return json({ error: 'not_configured' }, 501)
      throw err
    }

    const result = await completeImageGeneration(admin, mediaProvider, generation)

    const { data: updated } = await admin.from('ai_generations').select('result_asset_paths, error_message').eq('id', generationId).single()

    return json({ status: result.status, resultAssetPaths: updated?.result_asset_paths ?? [], errorMessage: updated?.error_message ?? null })
  } catch (err) {
    console.error('Erro inesperado em ai-check-image', err)
    return json({ error: 'Erro inesperado ao verificar a geração.' }, 500)
  }
})
