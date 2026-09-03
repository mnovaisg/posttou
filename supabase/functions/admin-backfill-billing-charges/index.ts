// Backfill administrativo, manual (nunca cron/polling): importa o
// histórico real de cobranças do Asaas para billing_charges — a
// autoridade agora é o próprio Asaas (GET /payments), não uma suposição
// local. Só para organizações que já existem no POSTTOU, associadas com
// segurança pelo asaas_customer_id gravado em subscriptions (nunca por
// heurística de nome/valor).
//
// Idempotente por asaas_payment_id (mesma RPC upsert_billing_charge_system
// do webhook) — rodar duas vezes nunca duplica. Nunca cria/cancela
// cobrança no Asaas (só GET), nunca toca subscriptions/créditos/
// entitlement. Resultado sempre registrado em audit_logs.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const LEDGER_STATUS_BY_ASAAS_STATUS: Record<string, 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'> = {
  PENDING: 'pending',
  AWAITING_RISK_ANALYSIS: 'pending',
  CONFIRMED: 'paid',
  RECEIVED: 'paid',
  RECEIVED_IN_CASH: 'paid',
  OVERDUE: 'overdue',
  REFUNDED: 'refunded',
  REFUND_REQUESTED: 'refunded',
  REFUND_IN_PROGRESS: 'refunded',
  CHARGEBACK_REQUESTED: 'refunded',
  CHARGEBACK_DISPUTE: 'refunded',
  AWAITING_CHARGEBACK_REVERSAL: 'refunded',
  DUNNING_REQUESTED: 'overdue',
  DUNNING_RECEIVED: 'paid',
}

interface AsaasPayment {
  id: string
  subscription?: string
  value: number
  status: string
  dueDate: string
  paymentDate?: string | null
  clientPaymentDate?: string | null
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

  // A checagem de admin acontece de verdade aqui, via RPC — nunca confia
  // só na rota /admin do frontend.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc('is_platform_admin')
  if (adminCheckError || !isAdmin) return json({ error: 'forbidden' }, 403)

  if (!asaasApiKey) return json({ error: 'asaas_not_configured' }, 500)

  const { data: userData } = await callerClient.auth.getUser()
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: subs, error: subsError } = await admin
    .from('subscriptions')
    .select('id, organization_id, plan_id, billing_interval, asaas_customer_id')
    .not('asaas_customer_id', 'is', null)

  if (subsError) return json({ error: 'query_failed', detail: subsError.message }, 500)

  let organizationsScanned = 0
  let paymentsImported = 0
  let paymentsUpdated = 0
  let paymentsSkipped = 0
  const errors: { organization_id: string; message: string }[] = []
  const unassociated: { asaas_payment_id: string; reason: string }[] = []

  for (const sub of subs ?? []) {
    organizationsScanned++
    try {
      let offset = 0
      let hasMore = true
      while (hasMore) {
        const res = await fetch(
          `${asaasBaseUrl}/payments?customer=${encodeURIComponent(sub.asaas_customer_id)}&limit=100&offset=${offset}`,
          { headers: { access_token: asaasApiKey } },
        )
        if (!res.ok) {
          errors.push({ organization_id: sub.organization_id, message: `Asaas respondeu ${res.status} para o customer ${sub.asaas_customer_id}.` })
          break
        }
        const body = (await res.json()) as { data: AsaasPayment[]; hasMore: boolean }

        for (const payment of body.data ?? []) {
          if (!payment.id || payment.value === undefined || payment.value === null || !payment.dueDate || !payment.status) {
            paymentsSkipped++
            unassociated.push({ asaas_payment_id: payment.id ?? '(sem id)', reason: 'payload_incompleto' })
            continue
          }

          const ledgerStatus = LEDGER_STATUS_BY_ASAAS_STATUS[payment.status]
          if (!ledgerStatus) {
            paymentsSkipped++
            unassociated.push({ asaas_payment_id: payment.id, reason: `status_asaas_nao_mapeado:${payment.status}` })
            continue
          }

          const finalAmountCents = Math.round(payment.value * 100)
          const kind = payment.subscription ? 'recurring' : 'upgrade'

          // Evidência de desconto: só a cobrança específica (coupon_redemptions
          // por asaas_payment_id) ou cupom recorrente já ativo ANTES do
          // vencimento desta cobrança (timestamp real, não suposição).
          // Sem nenhuma das duas: original/discount ficam NULL (desconhecido) —
          // nunca "original=final, discount=0" inventado pra fechar conta,
          // como aprovado no ajuste 2.
          let originalAmountCents: number | null = null
          let discountAmountCents: number | null = null
          let couponRedemptionId: string | null = null

          const { data: directRedemption } = await admin
            .from('coupon_redemptions')
            .select('id, original_amount_cents, discount_amount_cents')
            .eq('asaas_payment_id', payment.id)
            .maybeSingle()

          if (directRedemption) {
            couponRedemptionId = directRedemption.id
            originalAmountCents = directRedemption.original_amount_cents
            discountAmountCents = directRedemption.discount_amount_cents
          } else {
            const { data: recurringRedemption } = await admin
              .from('coupon_redemptions')
              .select('id, created_at, coupons!inner(duration)')
              .eq('organization_id', sub.organization_id)
              .eq('status', 'applied')
              .eq('coupons.duration', 'recurring')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (recurringRedemption && new Date(payment.dueDate) >= new Date(recurringRedemption.created_at)) {
              couponRedemptionId = recurringRedemption.id
              originalAmountCents = finalAmountCents
              discountAmountCents = 0
            }
          }

          const { data: existing } = await admin
            .from('billing_charges')
            .select('id')
            .eq('asaas_payment_id', payment.id)
            .maybeSingle()

          const { error: upsertError } = await admin.rpc('upsert_billing_charge_system', {
            p_organization_id: sub.organization_id,
            p_subscription_id: sub.id,
            p_asaas_payment_id: payment.id,
            p_asaas_subscription_id: payment.subscription ?? null,
            p_plan_id: sub.plan_id,
            p_billing_interval: sub.billing_interval,
            p_kind: kind,
            p_original_amount_cents: originalAmountCents,
            p_discount_amount_cents: discountAmountCents,
            p_final_amount_cents: finalAmountCents,
            p_coupon_redemption_id: couponRedemptionId,
            p_due_date: payment.dueDate,
            p_paid_at: ledgerStatus === 'paid' ? (payment.paymentDate ?? payment.clientPaymentDate ?? null) : null,
            p_status: ledgerStatus,
            p_raw_asaas_status: payment.status,
            p_source: 'backfill',
          })

          if (upsertError) {
            errors.push({ organization_id: sub.organization_id, message: `Falha ao gravar ${payment.id}: ${upsertError.message}` })
          } else if (existing) {
            paymentsUpdated++
          } else {
            paymentsImported++
          }
        }

        hasMore = !!body.hasMore
        offset += 100
      }
    } catch (err) {
      errors.push({ organization_id: sub.organization_id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  const summary = {
    organizations_scanned: organizationsScanned,
    payments_imported: paymentsImported,
    payments_updated: paymentsUpdated,
    payments_skipped: paymentsSkipped,
    unassociated,
    errors,
  }

  await admin.from('audit_logs').insert({
    workspace_id: null,
    user_id: userData?.user?.id ?? null,
    action: 'admin_billing_backfill_run',
    resource_type: 'billing_charges',
    resource_id: null,
    metadata: summary,
  })

  return json({ ok: true, summary })
})
