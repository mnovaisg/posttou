// Edge Function: cron diário da Fase 14B — converte estados "efetivos" de
// assinatura (trial vencido, past_due fora da tolerância, cancel_at_period_end
// vencido, downgrade/mudança de ciclo agendados) no estado gravado em
// subscriptions, e registra eventos de auditoria do funil comercial
// (item 19). O bloqueio de acesso em si nunca depende deste cron ter
// rodado — os gates (enforce_content_franchise_gate /
// check_subscription_entitlement) já calculam o status efetivo sob
// demanda via get_effective_subscription_status.
//
// Bloco mensal<->anual: run_subscription_status_transitions_system só
// aplica a troca LOCAL (SQL puro não fala com a Asaas) e devolve, em
// asaas_syncs_pending, a lista de organizações cuja recorrência Asaas
// precisa de um PUT real (value + cycle) — mesmo padrão seguro criado
// pra sincronização de upgrade: PUT idempotente, resultado sempre
// registrado via mark_asaas_subscription_sync_result_system (nunca
// falha silenciosa), falha aqui não desfaz a efetivação local já
// aplicada, só marca asaas_sync_status='failed' pro retry manual no
// Admin Financeiro.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface PendingSync {
  organization_id: string
  asaas_subscription_id: string
  target_price_cents: number
  billing_interval: 'monthly' | 'yearly'
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('BILLING_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
  const asaasBaseUrl = Deno.env.get('ASAAS_API_BASE_URL') ?? 'https://sandbox.asaas.com/api/v3'
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await admin.rpc('run_subscription_status_transitions_system')
  if (error) {
    console.error('billing-cron-dispatcher: falha ao rodar transições de status.', error)
    return json({ error: 'transition_failed', detail: error.message }, 500)
  }

  const toSync = (data?.asaas_syncs_pending as PendingSync[] | undefined) ?? []
  const syncResults: { organization_id: string; ok: boolean }[] = []

  for (const item of toSync) {
    if (!asaasApiKey) {
      await admin.rpc('mark_asaas_subscription_sync_result_system', {
        p_organization_id: item.organization_id,
        p_target_price_cents: item.target_price_cents,
        p_success: false,
        p_error: 'ASAAS_API_KEY não configurada no momento da sincronização.',
      })
      syncResults.push({ organization_id: item.organization_id, ok: false })
      continue
    }
    try {
      const res = await fetch(`${asaasBaseUrl}/subscriptions/${item.asaas_subscription_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', access_token: asaasApiKey },
        body: JSON.stringify({
          value: Number((item.target_price_cents / 100).toFixed(2)),
          cycle: item.billing_interval === 'monthly' ? 'MONTHLY' : 'YEARLY',
        }),
      })
      const resBody = await res.json()
      await admin.rpc('mark_asaas_subscription_sync_result_system', {
        p_organization_id: item.organization_id,
        p_target_price_cents: item.target_price_cents,
        p_success: res.ok,
        p_error: res.ok ? undefined : JSON.stringify(resBody).slice(0, 2000),
      })
      if (!res.ok) console.error('billing-cron-dispatcher: falha ao sincronizar recorrência Asaas na efetivação.', item.organization_id, resBody)
      syncResults.push({ organization_id: item.organization_id, ok: res.ok })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('billing-cron-dispatcher: erro de rede ao sincronizar recorrência Asaas na efetivação.', item.organization_id, message)
      await admin.rpc('mark_asaas_subscription_sync_result_system', {
        p_organization_id: item.organization_id,
        p_target_price_cents: item.target_price_cents,
        p_success: false,
        p_error: message,
      })
      syncResults.push({ organization_id: item.organization_id, ok: false })
    }
  }

  return json({ ok: true, result: data, asaas_syncs: syncResults })
})
