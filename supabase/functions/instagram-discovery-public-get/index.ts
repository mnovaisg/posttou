// Edge Function: consulta o resultado de uma Discovery pública pelo
// token opaco. Pública (verify_jwt=false) — mas só quem tem o token
// exato consegue algo; não existe listagem nem consulta por handle/id.
// Nunca aceita o id da sessão como credencial, só o token de alta
// entropia (seu hash é comparado no banco).
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
    const body = await req.json().catch(() => null)
    const token = (body as Record<string, unknown> | null)?.token
    if (typeof token !== 'string' || !token) return json({ error: 'token é obrigatório.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const tokenHash = await sha256Hex(token)
    const { data: session, error } = await admin
      .from('pre_onboarding_sessions')
      .select('status, handle, dna_preliminar, ideias_preliminares, error_code, error_message, claimed_at, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error || !session) return json({ error: 'not_found', message: 'Sessão não encontrada ou expirada.' }, 404)

    if (new Date(session.expires_at) < new Date() && session.status !== 'claimed') {
      return json({ status: 'expired', message: 'Essa análise expirou. Faça uma nova consulta.' }, 200)
    }

    return json({
      status: session.status,
      handle: session.handle,
      dna: session.dna_preliminar,
      ideias: session.ideias_preliminares,
      errorCode: session.error_code,
      errorMessage: session.error_message,
      claimed: !!session.claimed_at,
    })
  } catch (err) {
    console.error('instagram-discovery-public-get: erro inesperado.', err)
    return json({ error: 'internal_error' }, 500)
  }
})
