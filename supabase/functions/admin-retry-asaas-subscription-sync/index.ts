// Edge Function: retry manual (Admin) de sincronização da recorrência
// Asaas que ficou 'failed' (o PUT falhou na hora do webhook). Gatilho
// explícito, nunca automático/cron — o admin decide quando tentar de
// novo, depois de resolver a causa (ex.: Asaas fora do ar, chave
// errada). Idempotente: reenviar o mesmo PUT não tem efeito colateral.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface RetryRequest {
  organizationId: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
  const asaasBaseUrl = Deno.env.get('ASAAS_API_BASE_URL') ?? 'https://sandbox.asaas.com/api/v3'

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: isAdmin } = await callerClient.rpc('is_platform_admin')
  if (!isAdmin) return json({ error: 'not_platform_admin' }, 403)

  const body = (await req.json()) as RetryRequest
  if (!body?.organizationId) return json({ error: 'invalid_body' }, 400)

  if (!asaasApiKey) return json({ error: 'asaas_not_configured' }, 501)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: sub } = await admin
    .from('subscriptions')
    .select('asaas_subscription_id, asaas_sync_status, asaas_sync_target_price_cents, billing_interval')
    .eq('organization_id', body.organizationId)
    .maybeSingle()

  if (!sub || sub.asaas_sync_status !== 'failed' || !sub.asaas_subscription_id || sub.asaas_sync_target_price_cents == null) {
    return json({ error: 'no_pending_sync_to_retry' }, 400)
  }

  try {
    const res = await fetch(`${asaasBaseUrl}/subscriptions/${sub.asaas_subscription_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', access_token: asaasApiKey },
      body: JSON.stringify({
        value: Number((sub.asaas_sync_target_price_cents / 100).toFixed(2)),
        cycle: sub.billing_interval === 'monthly' ? 'MONTHLY' : 'YEARLY',
      }),
    })
    const resBody = await res.json()
    const { data: marked, error: markError } = await admin.rpc('mark_asaas_subscription_sync_result_system', {
      p_organization_id: body.organizationId,
      p_target_price_cents: sub.asaas_sync_target_price_cents,
      p_success: res.ok,
      p_error: res.ok ? undefined : JSON.stringify(resBody).slice(0, 2000),
    })
    if (markError) {
      console.error('admin-retry-asaas-subscription-sync: falha ao registrar resultado.', markError)
      return json({ error: 'internal_error' }, 500)
    }
    if (!res.ok) return json({ ok: false, error: 'asaas_put_failed', detail: resBody }, 502)
    return json({ ok: true, result: marked })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.rpc('mark_asaas_subscription_sync_result_system', {
      p_organization_id: body.organizationId,
      p_target_price_cents: sub.asaas_sync_target_price_cents,
      p_success: false,
      p_error: message,
    })
    return json({ ok: false, error: 'network_error', detail: message }, 502)
  }
})
