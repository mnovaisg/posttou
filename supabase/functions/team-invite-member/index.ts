// Edge Function: convida um membro para um workspace (Fase 14C).
// A checagem de papel/limite/lock vive inteiramente na RPC
// create_organization_invite (chamada com o client do usuário, para que
// has_workspace_role veja o auth.uid() correto) — esta função só cuida do
// envio do e-mail.
//
// Limitação conhecida (documentada no relatório final): só conseguimos
// enviar e-mail de verdade para quem AINDA NÃO tem conta no POSTTOU, via
// admin.auth.admin.inviteUserByEmail (usa o SMTP já configurado no
// Supabase Auth, sem nenhuma dependência nova). Para quem já tem conta,
// não existe canal de e-mail transacional configurado no projeto — o
// convite fica visível dentro do produto quando a pessoa loga, mas não
// recebe e-mail. Decisão de adicionar um provedor de e-mail transacional
// fica para fora deste escopo (custo/decisão externa).
import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface InviteRequest {
  workspaceId: string
  email: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  appUrl: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json()) as InviteRequest
  if (!body?.workspaceId || !body?.email || !body?.role || !body?.appUrl) {
    return json({ error: 'invalid_body' }, 400)
  }

  const { data: rpcResult, error: rpcError } = await userClient.rpc('create_organization_invite', {
    p_workspace_id: body.workspaceId,
    p_email: body.email,
    p_role: body.role,
  })
  if (rpcError) {
    return json({ error: 'invite_failed', message: rpcError.message }, 400)
  }
  const { invite_id: inviteId, token } = rpcResult[0]

  const inviteUrl = `${body.appUrl.replace(/\/$/, '')}/aceitar-convite?token=${token}`

  const admin = createClient(supabaseUrl, serviceRoleKey)
  let emailSent = false
  let emailSkippedReason: string | null = null

  try {
    const { error: inviteEmailError } = await admin.auth.admin.inviteUserByEmail(body.email, {
      redirectTo: inviteUrl,
      data: { invited_to_workspace: body.workspaceId },
    })
    if (!inviteEmailError) {
      emailSent = true
    } else if (inviteEmailError.message?.toLowerCase().includes('already') || inviteEmailError.message?.toLowerCase().includes('registered')) {
      emailSkippedReason = 'existing_user_no_email_channel'
    } else {
      console.error('team-invite-member: falha ao enviar e-mail de convite.', inviteEmailError)
      emailSkippedReason = 'send_failed'
    }
  } catch (err) {
    console.error('team-invite-member: erro inesperado ao enviar e-mail.', err)
    emailSkippedReason = 'send_failed'
  }

  return json({ inviteId, inviteUrl, emailSent, emailSkippedReason })
})
