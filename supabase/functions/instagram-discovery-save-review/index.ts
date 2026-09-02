// Edge Function: salva a revisão do DNA (e/ou o estágio da experiência)
// de uma sessão de Discovery pública ainda anônima. Pública
// (verify_jwt=false) pelo mesmo motivo de instagram-discovery-public-get
// — só quem tem o token de alta entropia consegue algo, nunca há
// listagem/consulta por id ou handle. Nunca mexe em dna_preliminar (o
// registro original da IA fica intacto para auditoria/reprocessamento);
// só grava em dna_revisado, uma coluna separada.
//
// Mesma trava de segurança do claim: UPDATE condicional (status='ready'
// AND claimed_at IS NULL AND expires_at > now()) — nunca escreve numa
// sessão já reivindicada, expirada, ou que nunca chegou a 'ready'.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sha256Hex } from '../_shared/instagram/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const VALID_STAGES = ['dna', 'previews', 'signup']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const token = body?.token
    const dnaRevisado = body?.dnaRevisado
    const stage = body?.stage

    if (typeof token !== 'string' || !token) return json({ error: 'token é obrigatório.' }, 400)
    if (stage !== undefined && !VALID_STAGES.includes(stage as string)) {
      return json({ error: 'invalid_stage' }, 400)
    }
    if (dnaRevisado !== undefined && (typeof dnaRevisado !== 'object' || dnaRevisado === null || Array.isArray(dnaRevisado))) {
      return json({ error: 'invalid_dna_revisado' }, 400)
    }
    if (dnaRevisado === undefined && stage === undefined) {
      return json({ error: 'invalid_body', message: 'Informe dnaRevisado e/ou stage.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const tokenHash = await sha256Hex(token)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (dnaRevisado !== undefined) patch.dna_revisado = dnaRevisado
    if (stage !== undefined) patch.flow_stage = stage

    const { data: updated, error } = await admin
      .from('pre_onboarding_sessions')
      .update(patch)
      .eq('token_hash', tokenHash)
      .eq('status', 'ready')
      .is('claimed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('instagram-discovery-save-review: erro ao salvar.', error)
      return json({ error: 'internal_error' }, 500)
    }
    if (!updated) {
      return json({ error: 'invalid_session', message: 'Essa análise não existe mais, já foi usada, ou expirou.' }, 410)
    }

    return json({ success: true })
  } catch (err) {
    console.error('instagram-discovery-save-review: erro inesperado.', err)
    return json({ error: 'internal_error' }, 500)
  }
})
