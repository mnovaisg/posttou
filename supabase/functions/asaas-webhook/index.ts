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
//
// Bloco Financeiro: além do processamento de entitlement acima (nunca
// alterado), toda entrega agora também sincroniza o ledger real de
// cobranças (billing_charges) via upsert_billing_charge_system —
// idempotente por asaas_payment_id, nunca duplica, nunca falha o
// processamento principal se o ledger falhar (best-effort, logado).
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
    dueDate?: string
    value?: number
    status?: string
  }
}

const LEDGER_STATUS_BY_EVENT: Record<string, 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'> = {
  PAYMENT_CREATED: 'pending',
  PAYMENT_UPDATED: 'pending',
  PAYMENT_CONFIRMED: 'paid',
  PAYMENT_RECEIVED: 'paid',
  PAYMENT_OVERDUE: 'overdue',
  PAYMENT_DELETED: 'cancelled',
  PAYMENT_CANCELED: 'cancelled',
  PAYMENT_REFUNDED: 'refunded',
  PAYMENT_REFUND_IN_PROGRESS: 'refunded',
}

// deno-lint-ignore no-explicit-any
async function syncLedger(admin: any, payload: AsaasWebhookPayload, kind: 'recurring' | 'upgrade') {
  const p = payload.payment
  if (!p?.id || p.value === undefined || p.value === null || !p.dueDate) return
  const ledgerStatus = LEDGER_STATUS_BY_EVENT[payload.event]
  if (!ledgerStatus) return

  try {
    let organizationId: string | null = null
    let subscriptionId: string | null = null
    let planId: string | null = null
    let billingInterval: 'monthly' | 'yearly' | null = null

    if (kind === 'recurring' && p.subscription) {
      const { data: sub } = await admin
        .from('subscriptions')
        .select('id, organization_id, plan_id, billing_interval')
        .eq('asaas_subscription_id', p.subscription)
        .maybeSingle()
      if (!sub) return // sem evidência segura de organização — não grava (nunca adivinha).
      organizationId = sub.organization_id
      subscriptionId = sub.id
      planId = sub.plan_id
      billingInterval = sub.billing_interval
    } else if (kind === 'upgrade' && p.externalReference) {
      const { data: sub } = await admin
        .from('subscriptions')
        .select('id, organization_id, plan_id, billing_interval')
        .eq('organization_id', p.externalReference)
        .maybeSingle()
      if (!sub) return
      organizationId = sub.organization_id
      subscriptionId = sub.id
      planId = sub.plan_id
      billingInterval = sub.billing_interval
    } else {
      return
    }

    // Evidência de cupom: (a) esta cobrança específica está em
    // coupon_redemptions (1ª cobrança ou upgrade) → valores exatos de lá;
    // (b) senão, se a organização tem cupom recorrente ativo, esta
    // renovação também é descontada nesse valor (fato conhecido, não
    // suposição); (c) senão, sem cupom = desconto 0 é fato, não invenção.
    const finalAmountCents = Math.round(p.value * 100)
    let originalAmountCents = finalAmountCents
    let discountAmountCents = 0
    let couponRedemptionId: string | null = null

    const { data: directRedemption } = await admin
      .from('coupon_redemptions')
      .select('id, original_amount_cents, discount_amount_cents')
      .eq('asaas_payment_id', p.id)
      .maybeSingle()

    if (directRedemption) {
      couponRedemptionId = directRedemption.id
      originalAmountCents = directRedemption.original_amount_cents
      discountAmountCents = directRedemption.discount_amount_cents
    } else {
      const { data: recurringRedemption } = await admin
        .from('coupon_redemptions')
        .select('id, coupon_id, coupons!inner(duration)')
        .eq('organization_id', organizationId)
        .eq('status', 'applied')
        .eq('coupons.duration', 'recurring')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recurringRedemption) {
        couponRedemptionId = recurringRedemption.id
        discountAmountCents = 0 // sem preço de tabela confiável neste ponto sem consulta extra; final=original é seguro (não inventa desconto por linha).
        originalAmountCents = finalAmountCents
      }
    }

    await admin.rpc('upsert_billing_charge_system', {
      p_organization_id: organizationId,
      p_subscription_id: subscriptionId,
      p_asaas_payment_id: p.id,
      p_asaas_subscription_id: p.subscription ?? null,
      p_plan_id: planId,
      p_billing_interval: billingInterval,
      p_kind: kind,
      p_original_amount_cents: originalAmountCents,
      p_discount_amount_cents: discountAmountCents,
      p_final_amount_cents: finalAmountCents,
      p_coupon_redemption_id: couponRedemptionId,
      p_due_date: p.dueDate,
      p_paid_at: ledgerStatus === 'paid' ? (p.paymentDate ?? new Date().toISOString()) : null,
      p_status: ledgerStatus,
      p_raw_asaas_status: p.status ?? payload.event,
      p_source: 'webhook',
    })
  } catch (err) {
    console.error('asaas-webhook: falha ao sincronizar billing_charges (não bloqueia o processamento principal).', err)
  }
}

// Bloco: sincronização da recorrência Asaas pós-upgrade. Chamado só
// quando o RPC de confirmação devolve asaas_sync_status='pending' (só
// acontece quando o motor de pró-rata rodou — mesmo ciclo, status
// active; trial/troca de ciclo nunca setam isso, de propósito). PUT é
// idempotente (setar o mesmo value de novo não tem efeito colateral),
// então é seguro chamar de novo numa reentrega de webhook. Nunca deixa
// o resultado silencioso: sucesso ou falha, sempre grava via
// mark_asaas_subscription_sync_result_system (que também loga em
// audit_logs) — falha aqui NUNCA derruba o processamento principal do
// webhook (isso já rodou e está correto; só a recorrência Asaas fica
// pendente, rastreável em admin_list_asaas_sync_issues_system pro
// retry manual do Admin).
// deno-lint-ignore no-explicit-any
async function syncAsaasSubscriptionValueIfPending(admin: any, asaasApiKey: string | undefined, asaasBaseUrl: string, result: Record<string, unknown> | null) {
  if (!result || result.asaas_sync_status !== 'pending') return
  const organizationId = result.organization_id as string | undefined
  const asaasSubscriptionId = result.asaas_subscription_id as string | null | undefined
  const targetPriceCents = result.asaas_sync_target_price_cents as number | null | undefined
  if (!organizationId || !asaasSubscriptionId || targetPriceCents === null || targetPriceCents === undefined) return

  if (!asaasApiKey) {
    await admin.rpc('mark_asaas_subscription_sync_result_system', {
      p_organization_id: organizationId,
      p_target_price_cents: targetPriceCents,
      p_success: false,
      p_error: 'ASAAS_API_KEY não configurada no momento da sincronização.',
    })
    return
  }

  try {
    const res = await fetch(`${asaasBaseUrl}/subscriptions/${asaasSubscriptionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', access_token: asaasApiKey },
      body: JSON.stringify({ value: Number((targetPriceCents / 100).toFixed(2)) }),
    })
    const body = await res.json()
    await admin.rpc('mark_asaas_subscription_sync_result_system', {
      p_organization_id: organizationId,
      p_target_price_cents: targetPriceCents,
      p_success: res.ok,
      p_error: res.ok ? null : JSON.stringify(body).slice(0, 2000),
    })
    if (!res.ok) console.error('asaas-webhook: falha ao sincronizar recorrência Asaas pós-upgrade.', body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('asaas-webhook: erro de rede ao sincronizar recorrência Asaas pós-upgrade.', message)
    await admin.rpc('mark_asaas_subscription_sync_result_system', {
      p_organization_id: organizationId,
      p_target_price_cents: targetPriceCents,
      p_success: false,
      p_error: message,
    })
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

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY')
  const asaasBaseUrl = Deno.env.get('ASAAS_API_BASE_URL') ?? 'https://sandbox.asaas.com/api/v3'

  const subscriptionId = payload.payment?.subscription
  const paymentId = payload.payment?.id
  const externalReference = payload.payment?.externalReference

  // ── Caminho 1: ciclo normal de uma subscription recorrente (checkout inicial, renovações) ──
  if (subscriptionId) {
    await syncLedger(admin, payload, 'recurring')

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
      await syncAsaasSubscriptionValueIfPending(admin, asaasApiKey, asaasBaseUrl, data as Record<string, unknown> | null)
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

    // PAYMENT_CREATED/PAYMENT_UPDATED/PAYMENT_DELETED/PAYMENT_CANCELED/
    // PAYMENT_REFUNDED etc. — nunca afetam entitlement/crédito, só o
    // ledger acima (já sincronizado).
    return json({ ok: true, ignored: true, event: payload.event })
  }

  // ── Caminho 2: cobrança avulsa de upgrade — sem payment.subscription, identificada por referência estruturada ──
  if (paymentId && externalReference) {
    await syncLedger(admin, payload, 'upgrade')

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
      await syncAsaasSubscriptionValueIfPending(admin, asaasApiKey, asaasBaseUrl, data as Record<string, unknown> | null)
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
