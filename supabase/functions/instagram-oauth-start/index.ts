// Edge Function: inicia o fluxo oficial de Instagram Business Login.
// Autenticado (verify_jwt=true) — só o próprio usuário logado, com papel
// owner/admin no workspace, pode iniciar uma conexão. Gera um state
// criptograficamente aleatório, de uso único e com expiração curta,
// gravado no servidor e vinculado a user_id+workspace_id — é isso que
// impede CSRF e impede a autorização de "vazar" para outro workspace.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildAuthorizeUrl } from '../_shared/instagram/provider.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutos — tempo de sobra pra completar o consentimento na Meta

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

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
    const workspaceId = (body as Record<string, unknown> | null)?.workspaceId
    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)

    const { data: canManage, error: roleError } = await userClient.rpc('has_workspace_role', {
      p_workspace_id: workspaceId,
      p_roles: ['owner', 'admin'],
    })
    if (roleError || !canManage) return json({ error: 'Só owner/admin do workspace pode conectar o Instagram.' }, 403)

    const appId = Deno.env.get('INSTAGRAM_APP_ID')
    if (!appId) {
      return json(
        { error: 'not_configured', message: 'A conexão com o Instagram ainda não está configurada neste ambiente (INSTAGRAM_APP_ID ausente).' },
        501,
      )
    }

    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`
    const state = randomState()
    const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()

    const { error: insertError } = await admin.from('instagram_oauth_states').insert({
      state,
      user_id: userData.user.id,
      workspace_id: workspaceId,
      expires_at: expiresAt,
    })
    if (insertError) {
      console.error('instagram-oauth-start: falha ao gravar state.', insertError)
      return json({ error: 'Erro inesperado ao iniciar a conexão.' }, 500)
    }

    const authorizeUrl = buildAuthorizeUrl({ appId, redirectUri, state })

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'instagram_conexao_iniciada',
      p_resource_type: 'instagram_accounts',
      p_metadata: {},
    })

    return json({ authorizeUrl })
  } catch (err) {
    console.error('instagram-oauth-start: erro inesperado.', err)
    return json({ error: 'Erro inesperado ao iniciar a conexão.' }, 500)
  }
})
