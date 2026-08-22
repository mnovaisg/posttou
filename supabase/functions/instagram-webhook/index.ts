// Edge Function: infraestrutura de recepção de webhooks do Instagram
// (Meta), preparada para o fluxo oficial "Instagram API with Instagram
// Login". Endpoint público — Meta chama isto diretamente, sem JWT do
// Supabase (verify_jwt=false), autenticado apenas pelo handshake
// hub.verify_token (GET) e pela assinatura HMAC X-Hub-Signature-256 (POST).
//
// Escopo desta etapa: só receber, verificar e registrar eventos com
// segurança (idempotência + associação a workspace). Não processa/reage a
// eventos ainda — isso é Fase 6 adiante, depois da aprovação do usuário.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(rawBody: string, signatureHeader: string, appSecret: string): Promise<boolean> {
  const [algo, receivedHex] = signatureHeader.split('=')
  if (algo !== 'sha256' || !receivedHex) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computedHex = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, '0')).join('')

  if (computedHex.length !== receivedHex.length) return false
  let diff = 0
  for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── GET: handshake de verificação da Meta ────────────────────────────
  // https://developers.facebook.com/docs/graph-api/webhooks/getting-started
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const verifyToken = Deno.env.get('INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
    if (!verifyToken) {
      console.error('instagram-webhook: INSTAGRAM_WEBHOOK_VERIFY_TOKEN não configurado — handshake não pode ser validado.')
      return text('not_configured', 501)
    }

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      console.log('instagram-webhook: handshake de verificação bem-sucedido.')
      return text(challenge, 200)
    }

    console.warn('instagram-webhook: handshake rejeitado (mode/token não conferem).', { mode, tokenMatches: token === verifyToken, hasChallenge: !!challenge })
    return text('Forbidden', 403)
  }

  if (req.method !== 'POST') {
    return text('method_not_allowed', 405)
  }

  // ── POST: evento real do Instagram ───────────────────────────────────
  try {
    const rawBody = await req.text()
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')

    let signatureVerified = false
    if (appSecret) {
      // Secret configurado: assinatura é obrigatória e precisa bater.
      if (!signatureHeader) {
        console.warn('instagram-webhook: requisição sem X-Hub-Signature-256 rejeitada (INSTAGRAM_APP_SECRET configurado).')
        return text('missing_signature', 401)
      }
      const valid = await verifySignature(rawBody, signatureHeader, appSecret)
      if (!valid) {
        console.warn('instagram-webhook: assinatura inválida — evento rejeitado.')
        return text('invalid_signature', 401)
      }
      signatureVerified = true
    } else {
      // Ainda não configuramos o Meta App/App Secret nesta etapa — aceita
      // e registra como não-verificado, nunca finge que verificou.
      console.warn('instagram-webhook: INSTAGRAM_APP_SECRET não configurado — evento aceito SEM verificação de assinatura (etapa de infraestrutura, antes do Meta App).')
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.error('instagram-webhook: corpo não é JSON válido.')
      return text('invalid_json', 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const bodyHash = await sha256Hex(rawBody)
    const entries = Array.isArray(payload?.entry) ? (payload.entry as Record<string, unknown>[]) : []

    if (entries.length === 0) {
      // Nada reconhecível em "entry" — registra mesmo assim para debug,
      // nunca descarta silenciosamente.
      const { error } = await admin.from('instagram_webhook_events').insert({
        ig_user_id: 'unknown',
        event_type: 'unrecognized_payload',
        payload,
        dedupe_key: `${bodyHash}:fallback`,
        signature_verified: signatureVerified,
      })
      if (error && error.code !== '23505') console.error('instagram-webhook: falha ao registrar payload não reconhecido.', error)
      return json({ received: true, entries: 0 })
    }

    let stored = 0
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const igUserId = String(entry?.id ?? 'unknown')
      const eventType = entry?.messaging ? 'messaging' : entry?.changes ? 'changes' : 'unknown'

      // Nunca confia em workspace_id vindo do payload (não existe — o
      // Instagram não sabe nada do POSTTOU). Sempre deriva server-side a
      // partir da conta já conectada, via ig_user_id.
      const { data: account } = await admin
        .from('instagram_accounts')
        .select('id, workspace_id')
        .eq('ig_user_id', igUserId)
        .maybeSingle()

      const { error } = await admin.from('instagram_webhook_events').insert({
        ig_user_id: igUserId,
        workspace_id: account?.workspace_id ?? null,
        instagram_account_id: account?.id ?? null,
        event_type: eventType,
        payload: entry,
        dedupe_key: `${bodyHash}:${i}`,
        signature_verified: signatureVerified,
      })

      if (error) {
        if (error.code === '23505') {
          console.log('instagram-webhook: evento duplicado ignorado (idempotência).', { igUserId, i })
        } else {
          console.error('instagram-webhook: falha ao registrar evento.', error)
        }
        continue
      }
      stored++
      console.log('instagram-webhook: evento registrado.', { igUserId, eventType, matchedWorkspace: !!account?.workspace_id, signatureVerified })
    }

    return json({ received: true, entries: entries.length, stored })
  } catch (err) {
    console.error('instagram-webhook: erro inesperado.', err)
    return text('internal_error', 500)
  }
})
