// Edge Function: cron diário da Fase 14B — converte estados "efetivos" de
// assinatura (trial vencido, past_due fora da tolerância, cancel_at_period_end
// vencido, downgrade agendado) no estado gravado em subscriptions, e
// registra eventos de auditoria do funil comercial (item 19). O bloqueio de
// acesso em si nunca depende deste cron ter rodado — os gates
// (enforce_content_franchise_gate / check_subscription_entitlement) já
// calculam o status efetivo sob demanda via get_effective_subscription_status.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('BILLING_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await admin.rpc('run_subscription_status_transitions_system')
  if (error) {
    console.error('billing-cron-dispatcher: falha ao rodar transições de status.', error)
    return json({ error: 'transition_failed', detail: error.message }, 500)
  }

  return json({ ok: true, result: data })
})
