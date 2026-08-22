// Edge Function: callback OAuth do Instagram Business Login. Público
// (verify_jwt=false) — é a Meta redirecionando o navegador do usuário
// pra cá, sem JWT do Supabase. A segurança inteira do fluxo depende do
// `state`: só é aceito um state que exista em instagram_oauth_states,
// ainda não usado e ainda não expirado — e é dali (nunca de nada vindo
// do cliente) que tiramos o workspace_id e o user_id corretos.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  InstagramApiError,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchProfile,
} from '../_shared/instagram/provider.ts'
import { encryptToken } from '../_shared/instagram/crypto.ts'

function redirectTo(appUrl: string, path: string, params: Record<string, string>) {
  const url = new URL(path, appUrl)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const appUrl = Deno.env.get('POSTTOU_APP_URL') || 'http://localhost:5173'

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const oauthError = url.searchParams.get('error')
  const oauthErrorReason = url.searchParams.get('error_reason')

  try {
    // ── Usuário cancelou/negou a autorização na tela da Meta ──────────
    if (oauthError) {
      console.warn('instagram-oauth-callback: autorização negada/cancelada.', { oauthError, oauthErrorReason })
      return redirectTo(appUrl, '/configuracoes', { instagram_error: oauthErrorReason || oauthError })
    }

    if (!state || !code) {
      return redirectTo(appUrl, '/configuracoes', { instagram_error: 'missing_params' })
    }

    // ── Reivindica o state de forma atômica: só passa se existir, não
    // estiver usado e não estiver expirado. Isso É a proteção de CSRF e
    // de replay — um state só pode completar o fluxo uma única vez.
    const { data: stateRow, error: stateError } = await admin
      .from('instagram_oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state', state)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('user_id, workspace_id')
      .maybeSingle()

    if (stateError || !stateRow) {
      console.warn('instagram-oauth-callback: state inválido, expirado ou já usado.', { state })
      return redirectTo(appUrl, '/configuracoes', { instagram_error: 'invalid_state' })
    }

    const { user_id: userId, workspace_id: workspaceId } = stateRow

    const appId = Deno.env.get('INSTAGRAM_APP_ID')
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')
    const encryptionKey = Deno.env.get('INSTAGRAM_TOKEN_ENCRYPTION_KEY')
    if (!appId || !appSecret || !encryptionKey) {
      console.error('instagram-oauth-callback: INSTAGRAM_APP_ID/APP_SECRET/TOKEN_ENCRYPTION_KEY ausente.')
      return redirectTo(appUrl, '/configuracoes', { instagram_error: 'not_configured' })
    }

    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`

    const shortLived = await exchangeCodeForShortLivedToken({ appId, appSecret, redirectUri, code })
    const longLived = await exchangeForLongLivedToken({ appSecret, shortLivedToken: shortLived.accessToken })
    const profile = await fetchProfile({ igUserId: shortLived.userId, accessToken: longLived.accessToken })

    const encryptedToken = await encryptToken(longLived.accessToken, encryptionKey)
    const tokenExpiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString()
    const nowIso = new Date().toISOString()

    const { error: upsertError } = await admin
      .from('instagram_accounts')
      .upsert(
        {
          workspace_id: workspaceId,
          ig_user_id: profile.id,
          username: profile.username,
          name: profile.name ?? null,
          profile_picture_url: profile.profilePictureUrl ?? null,
          status: 'conectado',
          access_token_encrypted: encryptedToken,
          token_expires_at: tokenExpiresAt,
          connected_by: userId,
          last_connected_at: nowIso,
          disconnected_at: null,
        },
        { onConflict: 'workspace_id,ig_user_id' },
      )

    if (upsertError) {
      if (upsertError.code === '23505') {
        // Conflito na constraint parcial de "uma conta ativa por vez" —
        // essa conta já está conectada em OUTRO workspace.
        console.warn('instagram-oauth-callback: conta Instagram já conectada em outro workspace.', { igUserId: profile.id })
        return redirectTo(appUrl, '/configuracoes', { instagram_error: 'already_connected_elsewhere' })
      }
      console.error('instagram-oauth-callback: falha ao gravar instagram_accounts.', upsertError)
      return redirectTo(appUrl, '/configuracoes', { instagram_error: 'storage_failed' })
    }

    await admin.from('audit_logs').insert({
      workspace_id: workspaceId,
      user_id: userId,
      action: 'instagram_conectado',
      resource_type: 'instagram_accounts',
      metadata: { ig_user_id: profile.id, username: profile.username },
    })

    console.log('instagram-oauth-callback: conta conectada com sucesso.', { workspaceId, igUserId: profile.id, username: profile.username })
    return redirectTo(appUrl, '/configuracoes', { instagram: 'success' })
  } catch (err) {
    const message = err instanceof InstagramApiError ? err.message : 'Erro inesperado ao conectar o Instagram.'
    console.error('instagram-oauth-callback: erro inesperado.', err)
    return redirectTo(appUrl, '/configuracoes', { instagram_error: 'provider_error', instagram_error_detail: message.slice(0, 500) })
  }
})
