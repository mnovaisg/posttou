// Edge Function: cria (ou reaproveita) o cliente e a assinatura no Asaas
// para uma organization, e devolve o link de pagamento hospedado pelo
// Asaas (invoiceUrl) para o usuário concluir o primeiro pagamento.
//
// Preço e nome do plano NUNCA vêm do cliente — sempre lidos de `plans` no
// banco (mesmo padrão de ai_operation_costs: preço decidido só no
// servidor). ASAAS_API_BASE_URL aponta para o sandbox por padrão — Fase
// 14B não usa produção do Asaas sem autorização explícita.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Bug real encontrado no teste do Gate 1 (release candidate): esta function
// nunca teve suporte a CORS — o navegador manda um preflight OPTIONS antes
// do POST real, e sem isto ele sempre recebia 405, bloqueando QUALQUER
// checkout feito pela UI (só funcionava via curl/server-to-server). Mesmo
// padrão de corsHeaders já usado em instagram-oauth-start/instagram-oauth-disconnect.
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

  const priceCents = body.billingInterval === 'monthly' ? plan.price_monthly_cents : plan.price_yearly_cents
  const priceReais = (priceCents / 100).toFixed(2)

  const asaasHeaders = { 'Content-Type': 'application/json', access_token: asaasApiKey }

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
      return json({ error: 'asaas_customer_failed', detail: custBody }, 502)
    }
    asaasCustomerId = custBody.id
  }

  const cycle = body.billingInterval === 'monthly' ? 'MONTHLY' : 'YEARLY'
  const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const subRes = await fetch(`${asaasBaseUrl}/subscriptions`, {
    method: 'POST',
    headers: asaasHeaders,
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: 'UNDEFINED', // permite o cliente escolher PIX/cartão na tela hospedada do Asaas
      value: Number(priceReais),
      nextDueDate,
      cycle,
      description: `POSTTOU — Plano ${plan.name} (${body.billingInterval === 'monthly' ? 'mensal' : 'anual'})`,
      externalReference: body.organizationId,
    }),
  })
  const subBody = await subRes.json()
  if (!subRes.ok) {
    console.error('billing-create-checkout: falha ao criar subscription no Asaas.', subBody)
    return json({ error: 'asaas_subscription_failed', detail: subBody }, 502)
  }

  await admin
    .from('subscriptions')
    .update({ asaas_customer_id: asaasCustomerId, asaas_subscription_id: subBody.id, plan_id: body.planId, billing_interval: body.billingInterval })
    .eq('organization_id', body.organizationId)

  // Busca a primeira cobrança gerada para devolver o link de pagamento
  // hospedado (invoiceUrl) — é para lá que o frontend redireciona o usuário.
  const paymentsRes = await fetch(`${asaasBaseUrl}/subscriptions/${subBody.id}/payments`, { headers: asaasHeaders })
  const paymentsBody = await paymentsRes.json()
  const firstPayment = paymentsBody?.data?.[0]

  return json({
    asaasCustomerId,
    asaasSubscriptionId: subBody.id,
    invoiceUrl: firstPayment?.invoiceUrl ?? null,
  })
})
