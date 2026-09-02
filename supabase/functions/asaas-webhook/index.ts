// Edge Function: recebe webhooks financeiros do Asaas (Fase 14B).
// Endpoint público (verify_jwt=false) — o Asaas chama isto diretamente,
// sem JWT do Supabase. Autenticado pelo header `asaas-access-token`
// (comparação em tempo constante contra ASAAS_WEBHOOK_TOKEN, um segredo
// que nós definimos e cadastramos manualmente na configuração de webhook
// do painel Asaas — não é algo que a API do Asaas gera sozinha).
//
// Idempotência: todo processamento passa por RPCs que gravam o id do
// evento em asaas_webhook_events (unique) ANTES de aplicar qualquer
// efeito — reentrega do mesmo evento nunca duplica ativação de
// assinatura, franquia, upgrade ou qualquer efeito financeiro.
//
// Bloco 11.1-B: duas famílias de cobrança chegam aqui —
// (1) ciclo normal de uma subscription recorrente (`payment.subscription`
//     presente) → process_asaas_payment_confirmed_system, como sempre;
// (2) cobrança AVULSA de upgrade (sem `payment.subscription`, porque não
//     é um ciclo de subscription nenhuma) → identificada por referência
//     ESTRUTURADA: `payment.id` batendo com
//     subscriptions.pending_change_payment_id (gravado no momento em que
//     a cobrança foi criada) E `payment.externalReference` batendo com a
//     organização — nunca por texto de descrição.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface AsaasWebhookPayload {
  id: string
  event: string
  payment?: {
    id?: string
    subscription?: string
    externalReference?: string
    dateCreated?: string
    paymentDate?: string
    nextDueDate?: string
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
  const receivedToken = req.headers.get('asaas-access-token')
  if (!expectedToken || !receivedToken || !timingSafeEqual(expectedToken, receivedToken)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const payload = (await req.json()) as AsaasWebhookPayload
  if (!payload?.id || !payload?.event) {
    return json({ error: 'invalid_payload' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const subscriptionId = payload.payment?.subscription
  const paymentId = payload.payment?.id
  const externalReference = payload.payment?.externalReference

  // ── Caminho 1: ciclo normal de uma subscription recorrente (checkout inicial, renovações) ──
  if (subscriptionId) {
    if (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED') {
      const periodStart = payload.payment?.paymentDate ?? payload.payment?.dateCreated ?? new Date().toISOString()
      const periodEnd = payload.payment?.nextDueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await admin.rpc('process_asaas_payment_confirmed_system', {
        p_asaas_subscription_id: subscriptionId,
        p_asaas_event_id: payload.id,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      })
      if (error) {
        console.error('asaas-webhook: falha ao processar PAYMENT_CONFIRMED.', error)
        return json({ error: 'processing_failed', detail: error.message }, 500)
      }
      return json({ ok: true, result: data })
    }

    if (payload.event === 'PAYMENT_OVERDUE') {
      const { data, error } = await admin.rpc('process_asaas_payment_overdue_system', {
        p_asaas_subscription_id: subscriptionId,
        p_asaas_event_id: payload.id,
      })
      if (error) {
        console.error('asaas-webhook: falha ao processar PAYMENT_OVERDUE.', error)
        return json({ error: 'processing_failed', detail: error.message }, 500)
      }
      return json({ ok: true, result: data })
    }

    return json({ ok: true, ignored: true, event: payload.event })
  }

  // ── Caminho 2: cobrança avulsa de upgrade — sem payment.subscription, identificada por referência estruturada ──
  if (paymentId && externalReference) {
    if (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED') {
      const { data, error } = await admin.rpc('process_asaas_upgrade_payment_confirmed_system', {
        p_asaas_payment_id: paymentId,
        p_organization_id: externalReference,
        p_asaas_event_id: payload.id,
      })
      if (error) {
        console.error('asaas-webhook: falha ao processar confirmação de upgrade.', error)
        return json({ error: 'processing_failed', detail: error.message }, 500)
      }
      return json({ ok: true, result: data })
    }

    if (payload.event === 'PAYMENT_OVERDUE' || payload.event === 'PAYMENT_DELETED' || payload.event === 'PAYMENT_CANCELED') {
      const { data, error } = await admin.rpc('release_stale_upgrade_system', {
        p_asaas_payment_id: paymentId,
        p_organization_id: externalReference,
        p_asaas_event_id: payload.id,
      })
      if (error) {
        console.error('asaas-webhook: falha ao liberar upgrade vencido/cancelado.', error)
        return json({ error: 'processing_failed', detail: error.message }, 500)
      }
      return json({ ok: true, result: data })
    }

    return json({ ok: true, ignored: true, event: payload.event })
  }

  return json({ ok: true, ignored: true })
})
