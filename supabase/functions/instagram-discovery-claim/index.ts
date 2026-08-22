// Edge Function: reivindica (claim) uma sessão de Discovery anônima
// depois do cadastro/login, vinculando-a a um workspace real. Requer
// JWT — chamada logo após o usuário criar conta ou logar. Claim é
// atômico e single-use: UPDATE condicional (status='ready' AND
// claimed_at IS NULL AND expires_at > now()) — só passa uma vez, mesmo
// padrão já validado em instagram_oauth_states.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sha256Hex } from '../_shared/instagram/crypto.ts'

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
    const token = (body as Record<string, unknown> | null)?.token
    const workspaceId = (body as Record<string, unknown> | null)?.workspaceId
    if (typeof token !== 'string' || !token) return json({ error: 'token é obrigatório.' }, 400)
    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)

    const { data: isMember, error: memberError } = await userClient.rpc('is_workspace_member', { p_workspace_id: workspaceId })
    if (memberError || !isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    const tokenHash = await sha256Hex(token)

    const { data: claimed, error: claimError } = await admin
      .from('pre_onboarding_sessions')
      .update({
        status: 'claimed',
        claimed_by_user_id: userData.user.id,
        claimed_workspace_id: workspaceId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('token_hash', tokenHash)
      .eq('status', 'ready')
      .is('claimed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id, handle, dna_preliminar, ideias_preliminares')
      .maybeSingle()

    if (claimError) {
      console.error('instagram-discovery-claim: erro ao reivindicar.', claimError)
      return json({ error: 'internal_error' }, 500)
    }
    if (!claimed) {
      return json({ error: 'invalid_session', message: 'Essa análise não existe mais, já foi usada, ou expirou.' }, 410)
    }

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'instagram_discovery_claimed',
      p_resource_type: 'pre_onboarding_sessions',
      p_resource_id: claimed.id,
      p_metadata: { handle: claimed.handle },
    })

    return json({ success: true, handle: claimed.handle, dna: claimed.dna_preliminar, ideias: claimed.ideias_preliminares })
  } catch (err) {
    console.error('instagram-discovery-claim: erro inesperado.', err)
    return json({ error: 'internal_error' }, 500)
  }
})
