// Edge Function: cria (ou reaproveita) o cliente e a assinatura no Asaas
// para uma organization, e devolve o link de pagamento hospedado pelo
// Asaas (invoiceUrl) para o usuário concluir o primeiro pagamento.
//
// Preço e nome do plano NUNCA vêm do cliente — sempre lidos de `plans` no
// banco (mesmo padrão de ai_operation_costs: preço decidido só no
// servidor). ASAAS_API_BASE_URL aponta para o sandbox por padrão — Fase
// 14B não usa produção do Asaas sem autorização explícita.
//
// Bloco 11 complemento — cupons: o frontend só manda `couponCode` (texto
// livre). Todo o resto (existe? ativo? datas? plano elegível? já usado
// por esta organização? valor do desconto?) é decidido por
// reserve_coupon_redemption_system, uma RPC SECURITY DEFINER só acessível
// a service_role — o valor final nunca é calculado nem confiado a partir
// do que o cliente manda. duration='recurring' desconta o value já na
// criação da subscription (aplica em todos os ciclos futuros, sem
// nenhuma chamada extra ao Asaas). duration='first_payment' cria a
// subscription no preço cheio (ciclos 2+ corretos) e depois só sobrescreve
// o VALOR da primeira cobrança já gerada via PUT /payments/{id} — API
// padrão do Asaas para editar uma cobrança ainda não paga.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface CheckoutRequest {
  organizationId: string
  planId: string
  billingInterval: 'monthly' | 'yearly'
  cpfCnpj: string
  couponCode?: string
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

  if (!asaasApiKey) {
    return json({ error: 'asaas_not_configured', message: 'ASAAS_API_KEY não configurada. Integração de cobrança indisponível.' }, 501)
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json()) as CheckoutRequest
  const cpfCnpjDigits = (body?.cpfCnpj ?? '').replace(/\D/g, '')
  if (!body?.organizationId || !body?.planId || !body?.billingInterval || !cpfCnpjDigits) {
    return json({ error: 'invalid_body', message: 'organizationId, planId, billingInterval e cpfCnpj são obrigatórios.' }, 400)
  }
  if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    return json({ error: 'invalid_cpf_cnpj', message: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // is_organization_owner lê auth.uid() — precisa rodar com o client do
  // usuário (Authorization do request), nunca com o client service_role,
  // que não carrega JWT nenhum e faria a checagem falhar sempre.
  const { data: isOwner } = await userClient.rpc('is_organization_owner', { p_organization_id: body.organizationId })
  if (!isOwner) return json({ error: 'forbidden' }, 403)

  const { data: plan, error: planError } = await admin.from('plans').select('*').eq('id', body.planId).eq('is_active', true).maybeSingle()
  if (planError || !plan) return json({ error: 'invalid_plan' }, 400)

  const { data: sub, error: subError } = await admin.from('subscriptions').select('*').eq('organization_id', body.organizationId).maybeSingle()
  if (subError || !sub) return json({ error: 'subscription_not_found' }, 404)

  const { data: org } = await admin.from('organizations').select('*').eq('id', body.organizationId).single()

  const fullPriceCents = body.billingInterval === 'monthly' ? plan.price_monthly_cents : plan.price_yearly_cents

  // ── Cupom (opcional): reserva atômica + idempotente antes de tocar no Asaas ──
  let redemption: {
    ok: true
    redemptionId: string
    couponId: string
    code: string
    duration: 'first_payment' | 'recurring'
    discountType: 'percentage' | 'fixed'
    originalAmountCents: number
    discountAmountCents: number
    finalAmountCents: number
  } | null = null

  const couponCode = body.couponCode?.trim()
  if (couponCode) {
    const { data: reserveResult, error: reserveError } = await admin.rpc('reserve_coupon_redemption_system', {
      p_organization_id: body.organizationId,
      p_code: couponCode,
      p_plan_id: body.planId,
      p_billing_interval: body.billingInterval,
    })
    if (reserveError) {
      console.error('billing-create-checkout: falha ao reservar cupom.', reserveError)
      return json({ error: 'coupon_reservation_failed' }, 500)
    }
    if (!reserveResult?.ok) {
      return json({ error: 'invalid_coupon', reason: reserveResult?.reason ?? 'unknown' }, 400)
    }
    redemption = reserveResult
  }

  const checkoutPriceCents = redemption ? redemption.finalAmountCents : fullPriceCents
  const priceReais = (checkoutPriceCents / 100).toFixed(2)

  const asaasHeaders = { 'Content-Type': 'application/json', access_token: asaasApiKey }

  async function releaseReservation(reason: string) {
    if (!redemption) return
    await admin.rpc('finalize_coupon_redemption_system', { p_redemption_id: redemption.redemptionId, p_status: 'failed', p_failure_reason: reason }).catch((e: unknown) => {
      console.error('billing-create-checkout: falha ao liberar reserva de cupom.', e)
    })
  }

  let asaasCustomerId = sub.asaas_customer_id as string | null
  if (!asaasCustomerId) {
    const custRes = await fetch(`${asaasBaseUrl}/customers`, {
      method: 'POST',
      headers: asaasHeaders,
      body: JSON.stringify({ name: org?.name ?? 'Organization POSTTOU', cpfCnpj: cpfCnpjDigits, externalReference: body.organizationId }),
    })
    const custBody = await custRes.json()
    if (!custRes.ok) {
      console.error('billing-create-checkout: falha ao criar customer no Asaas.', custBody)
      await releaseReservation('asaas_customer_failed')
      return json({ error: 'asaas_customer_failed', detail: custBody }, 502)
    }
    asaasCustomerId = custBody.id
  }

  const cycle = body.billingInterval === 'monthly' ? 'MONTHLY' : 'YEARLY'
  const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // duration='recurring' já desconta aqui (vale pra todos os ciclos, sem
  // chamada extra); duration='first_payment' cria no preço CHEIO — o
  // desconto da 1ª cobrança é aplicado depois, sobrescrevendo só ela.
  const subscriptionCreationPriceCents = redemption?.duration === 'recurring' ? redemption.finalAmountCents : fullPriceCents
  const subscriptionCreationPriceReais = (subscriptionCreationPriceCents / 100).toFixed(2)

  const subRes = await fetch(`${asaasBaseUrl}/subscriptions`, {
    method: 'POST',
    headers: asaasHeaders,
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: 'UNDEFINED', // permite o cliente escolher PIX/cartão na tela hospedada do Asaas
      value: Number(subscriptionCreationPriceReais),
      nextDueDate,
      cycle,
      description: `POSTTOU — Plano ${plan.name} (${body.billingInterval === 'monthly' ? 'mensal' : 'anual'})`,
      externalReference: body.organizationId,
    }),
  })
  const subBody = await subRes.json()
  if (!subRes.ok) {
    console.error('billing-create-checkout: falha ao criar subscription no Asaas.', subBody)
    await releaseReservation('asaas_subscription_failed')
    return json({ error: 'asaas_subscription_failed', detail: subBody }, 502)
  }

  const { data: updatedSub } = await admin
    .from('subscriptions')
    .update({ asaas_customer_id: asaasCustomerId, asaas_subscription_id: subBody.id, plan_id: body.planId, billing_interval: body.billingInterval })
    .eq('organization_id', body.organizationId)
    .select('id')
    .single()

  // Busca a primeira cobrança gerada para devolver o link de pagamento
  // hospedado (invoiceUrl) — é para lá que o frontend redireciona o usuário.
  const paymentsRes = await fetch(`${asaasBaseUrl}/subscriptions/${subBody.id}/payments`, { headers: asaasHeaders })
  const paymentsBody = await paymentsRes.json()
  let firstPayment = paymentsBody?.data?.[0]

  let couponAppliedSuccessfully = false
  if (redemption && redemption.duration === 'first_payment' && firstPayment?.id) {
    const updateRes = await fetch(`${asaasBaseUrl}/payments/${firstPayment.id}`, {
      method: 'PUT',
      headers: asaasHeaders,
      body: JSON.stringify({ value: Number(priceReais) }),
    })
    const updateBody = await updateRes.json()
    if (updateRes.ok) {
      firstPayment = updateBody
      couponAppliedSuccessfully = true
    } else {
      // Falha ao sobrescrever o valor da 1ª cobrança: a subscription já
      // existe no Asaas no preço cheio — não travamos o checkout (o
      // usuário ainda consegue pagar, só que sem o desconto), mas o
      // cupom NUNCA é marcado como consumido nesse caso.
      console.error('billing-create-checkout: falha ao aplicar desconto na 1ª cobrança.', updateBody)
    }
  } else if (redemption && redemption.duration === 'recurring') {
    couponAppliedSuccessfully = true
  }

  if (redemption) {
    await admin.rpc('finalize_coupon_redemption_system', {
      p_redemption_id: redemption.redemptionId,
      p_status: couponAppliedSuccessfully ? 'applied' : 'failed',
      p_subscription_id: updatedSub?.id ?? null,
      p_asaas_subscription_id: subBody.id,
      p_asaas_payment_id: redemption.duration === 'first_payment' ? (firstPayment?.id ?? null) : null,
      p_failure_reason: couponAppliedSuccessfully ? null : 'asaas_payment_update_failed',
    })
  }

  return json({
    asaasCustomerId,
    asaasSubscriptionId: subBody.id,
    invoiceUrl: firstPayment?.invoiceUrl ?? null,
    coupon: redemption
      ? {
          code: redemption.code,
          applied: couponAppliedSuccessfully,
          originalAmountCents: redemption.originalAmountCents,
          discountAmountCents: redemption.discountAmountCents,
          finalAmountCents: redemption.finalAmountCents,
          duration: redemption.duration,
        }
      : null,
  })
})
