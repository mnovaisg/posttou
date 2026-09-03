// Edge Function: solicita troca de plano (Fase 14B, decisão 14/15).
// Downgrade: só chama request_plan_change — aplica no próximo ciclo, sem
// cobrança nova. Upgrade: chama request_plan_change (registra a intenção)
// e cria uma cobrança avulsa no Asaas pela diferença; os novos
// entitlements só são liberados quando o webhook confirmar esse pagamento
// (asaas-webhook -> process_asaas_payment_confirmed_system ->
// apply_confirmed_plan_change_system). Nunca libera acesso antes disso.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Bug real encontrado no teste do Gate 1: nunca teve suporte a CORS —
// bloqueava qualquer chamada real do navegador (mesmo achado de
// billing-create-checkout).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface ChangePlanRequest {
  organizationId: string
  newPlanId: string
  newBillingInterval: 'monthly' | 'yearly'
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

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json()) as ChangePlanRequest
  if (!body?.organizationId || !body?.newPlanId || !body?.newBillingInterval) return json({ error: 'invalid_body' }, 400)

  // request_plan_change já valida is_organization_owner internamente.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: changeResult, error: changeError } = await callerClient.rpc('request_plan_change', {
    p_organization_id: body.organizationId,
    p_new_plan_id: body.newPlanId,
    p_new_billing_interval: body.newBillingInterval,
  })
  if (changeError) {
    // Bloco 12.2: request_plan_change usa `hint` do Postgres pra carregar
    // uma mensagem segura pro usuário em falhas esperadas (ex.: troca de
    // ciclo bloqueada) — repassamos como `message` pro frontend exibir
    // direto, sem vazar o texto técnico da exceção.
    return json({ error: 'request_plan_change_failed', message: changeError.hint ?? undefined, detail: changeError.message }, 400)
  }

  if (changeResult.kind === 'downgrade') {
    return json({ kind: 'downgrade', appliedAtNextCycle: true })
  }

  // Upgrade: precisa de cobrança da diferença antes de liberar.
  if (!asaasApiKey) {
    return json({ error: 'asaas_not_configured', message: 'ASAAS_API_KEY não configurada. Upgrade não pode gerar cobrança agora.' }, 501)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: sub } = await admin.from('subscriptions').select('*').eq('organization_id', body.organizationId).single()
  if (!sub?.asaas_customer_id) {
    return json({ error: 'no_asaas_customer', message: 'Organization ainda não tem cliente Asaas — use billing-create-checkout primeiro.' }, 400)
  }

  const priceReais = (changeResult.new_price_cents / 100).toFixed(2)
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const chargeRes = await fetch(`${asaasBaseUrl}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: asaasApiKey },
    body: JSON.stringify({
      customer: sub.asaas_customer_id,
      billingType: 'UNDEFINED',
      value: Number(priceReais),
      dueDate,
      description: `POSTTOU — Upgrade para plano ${changeResult.new_plan_id}`,
      externalReference: body.organizationId,
    }),
  })
  const chargeBody = await chargeRes.json()
  if (!chargeRes.ok) {
    console.error('billing-change-plan: falha ao criar cobrança de upgrade no Asaas.', chargeBody)
    return json({ error: 'asaas_charge_failed', detail: chargeBody }, 502)
  }

  // Bloco 11.1-B: grava a referência ESTRUTURADA (id exato da cobrança
  // recém-criada) que o asaas-webhook usa pra reconhecer e confirmar este
  // upgrade quando o pagamento chegar — sem isto, a cobrança avulsa (que
  // não carrega payment.subscription) nunca era identificável no webhook.
  const { error: recordError } = await admin.rpc('record_pending_upgrade_payment_system', {
    p_organization_id: body.organizationId,
    p_asaas_payment_id: chargeBody.id,
  })
  if (recordError) {
    console.error('billing-change-plan: falha ao gravar referência da cobrança de upgrade.', recordError)
    return json({ error: 'internal_error', message: 'Cobrança criada, mas não foi possível registrar a referência de confirmação. Contate o suporte.' }, 500)
  }

  return json({ kind: 'upgrade', invoiceUrl: chargeBody.invoiceUrl ?? null, awaitingPaymentConfirmation: true })
})
