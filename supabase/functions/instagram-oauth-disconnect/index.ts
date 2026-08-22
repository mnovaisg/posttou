// Edge Function: desconecta uma conta Instagram do workspace.
// Autenticado — só owner/admin do workspace dono da conta pode
// desconectar. Invalida o token localmente (nunca deixa
// access_token_encrypted vivo numa conta desconectada) e registra
// auditoria. Não há endpoint documentado de revogação remota para o
// produto "Instagram API with Instagram Login" — ver limitações no
// relatório da fase.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
    const instagramAccountId = (body as Record<string, unknown> | null)?.instagramAccountId
    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)
    if (typeof instagramAccountId !== 'string' || !instagramAccountId) return json({ error: 'instagramAccountId é obrigatório.' }, 400)

    const { data: canManage, error: roleError } = await userClient.rpc('has_workspace_role', {
      p_workspace_id: workspaceId,
      p_roles: ['owner', 'admin'],
    })
    if (roleError || !canManage) return json({ error: 'Só owner/admin do workspace pode desconectar o Instagram.' }, 403)

    // Confirma que a conta pertence mesmo a este workspace antes de mexer
    // — nunca confia só no instagramAccountId vindo do cliente.
    const { data: account, error: fetchError } = await admin
      .from('instagram_accounts')
      .select('id, workspace_id, ig_user_id, username, status')
      .eq('id', instagramAccountId)
      .maybeSingle()

    if (fetchError || !account || account.workspace_id !== workspaceId) {
      return json({ error: 'Conta Instagram não encontrada neste workspace.' }, 404)
    }

    if (account.status === 'desconectado') {
      return json({ success: true, alreadyDisconnected: true })
    }

    const { error: updateError } = await admin
      .from('instagram_accounts')
      .update({
        status: 'desconectado',
        disconnected_at: new Date().toISOString(),
        access_token_encrypted: null,
        token_expires_at: null,
      })
      .eq('id', instagramAccountId)

    if (updateError) {
      console.error('instagram-oauth-disconnect: falha ao atualizar conta.', updateError)
      return json({ error: 'Erro inesperado ao desconectar.' }, 500)
    }

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'instagram_desconectado',
      p_resource_type: 'instagram_accounts',
      p_resource_id: instagramAccountId,
      p_metadata: { ig_user_id: account.ig_user_id, username: account.username },
    })

    return json({ success: true })
  } catch (err) {
    console.error('instagram-oauth-disconnect: erro inesperado.', err)
    return json({ error: 'Erro inesperado ao desconectar.' }, 500)
  }
})
