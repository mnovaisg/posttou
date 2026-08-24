// Edge Function: cancelamento (Fase 14B, decisão 16) — sempre
// cancel_at_period_end, nunca imediato. Cancela a recorrência no Asaas
// (para não gerar novas cobranças) e agenda o fim de acesso via
// schedule_subscription_cancellation, que só entra em vigor quando o
// período já pago terminar (billing-cron-dispatcher aplica a transição).
import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
  const asaasBaseUrl = Deno.env.get('ASAAS_API_BASE_URL') ?? 'https://sandbox.asaas.com/api/v3'

  const { organizationId } = (await req.json()) as { organizationId: string }
  if (!organizationId) return json({ error: 'invalid_body' }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: sub } = await admin.from('subscriptions').select('*').eq('organization_id', organizationId).maybeSingle()

  if (sub?.asaas_subscription_id && asaasApiKey) {
    const delRes = await fetch(`${asaasBaseUrl}/subscriptions/${sub.asaas_subscription_id}`, {
      method: 'DELETE',
      headers: { access_token: asaasApiKey },
    })
    if (!delRes.ok) {
      const detail = await delRes.json().catch(() => null)
      console.error('billing-cancel-subscription: falha ao cancelar no Asaas.', detail)
      // Segue mesmo assim para o próximo passo (schedule) — cancelar no
      // nosso lado é mais importante para o usuário do que travar por uma
      // falha de rede pontual no Asaas; o estado fica registrado para
      // conferência manual se necessário.
    }
  }

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: result, error } = await callerClient.rpc('schedule_subscription_cancellation', { p_organization_id: organizationId })
  if (error) return json({ error: 'schedule_cancellation_failed', detail: error.message }, 400)

  return json({ ok: true, subscription: result })
})
