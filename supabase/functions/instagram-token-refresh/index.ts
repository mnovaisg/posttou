// Edge Function: renova tokens de longa duração do Instagram antes de
// expirarem (item 19 da Fase 7). Chamado por pg_cron uma vez ao dia —
// nunca pelo navegador. refreshLongLivedToken() já existia desde a
// Fase 6 (OAuth) mas nunca tinha sido agendado; aqui só conectamos o
// job. Contas cujo token já expirou não são recuperáveis por refresh
// (a Meta exige token ainda válido para renovar) — essas são marcadas
// para reautorização, nunca ficam presas num estado incerto.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decryptToken, encryptToken } from '../_shared/instagram/crypto.ts'
import { InstagramApiError, refreshLongLivedToken } from '../_shared/instagram/provider.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Refresca com folga — token de longa duração dura ~60 dias; renovar
// quando faltam menos de 10 evita qualquer corrida com o worker de
// publicação.
const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('INSTAGRAM_PUBLISH_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const tokenEncryptionKey = Deno.env.get('INSTAGRAM_TOKEN_ENCRYPTION_KEY')
  const admin = createClient(supabaseUrl, serviceRoleKey)

  if (!tokenEncryptionKey) return json({ error: 'not_configured' }, 501)

  const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString()
  const { data: accounts, error } = await admin
    .from('instagram_accounts')
    .select('id, workspace_id, access_token_encrypted, token_expires_at')
    .eq('status', 'conectado')
    .not('access_token_encrypted', 'is', null)
    .lte('token_expires_at', cutoff)

  if (error) {
    console.error('instagram-token-refresh: falha ao listar contas.', error)
    return json({ error: 'internal_error' }, 500)
  }

  const results: Array<{ id: string; outcome: string }> = []

  for (const account of accounts ?? []) {
    try {
      const currentToken = await decryptToken(account.access_token_encrypted as string, tokenEncryptionKey)
      const refreshed = await refreshLongLivedToken(currentToken)
      const encrypted = await encryptToken(refreshed.accessToken, tokenEncryptionKey)
      const newExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString()

      await admin
        .from('instagram_accounts')
        .update({ access_token_encrypted: encrypted, token_expires_at: newExpiresAt })
        .eq('id', account.id)

      await admin.rpc('log_audit_event', {
        p_workspace_id: account.workspace_id,
        p_action: 'instagram_token_refreshed',
        p_resource_type: 'instagram_accounts',
        p_resource_id: account.id,
        p_metadata: { new_expires_at: newExpiresAt },
      })

      results.push({ id: account.id, outcome: 'refreshed' })
    } catch (err) {
      // Token já expirado/revogado não é renovável — marca para
      // reautorização em vez de tentar de novo indefinidamente.
      const isAuthError = err instanceof InstagramApiError
      await admin.from('instagram_accounts').update({ status: 'token_expirado' }).eq('id', account.id)
      await admin.rpc('log_audit_event', {
        p_workspace_id: account.workspace_id,
        p_action: 'instagram_reauthorization_required',
        p_resource_type: 'instagram_accounts',
        p_resource_id: account.id,
        p_metadata: { reason: 'refresh_failed', is_auth_error: isAuthError },
      }).catch(() => {})
      console.error(`instagram-token-refresh: falha ao renovar token da conta ${account.id}.`, err)
      results.push({ id: account.id, outcome: 'reauthorization_required' })
    }
  }

  return json({ processed: results.length, results })
})
