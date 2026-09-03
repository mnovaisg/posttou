// Exportação CSV de Clientes & Leads — exclusivamente administrativa.
// A autorização real não é a rota /admin do frontend: é o próprio RPC
// admin_list_leads_system, chamado aqui com o JWT de quem chamou (nunca
// service_role) — se não for platform_admin, o RPC lança NOT_PLATFORM_ADMIN
// e a função nunca chega a gerar CSV nem a registrar auditoria.
// Nunca inclui organization_id/workspace_id/owner_user_id/tokens — só
// colunas seguras de negócio.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COMMERCIAL_STATUS_LABEL: Record<string, string> = {
  trial_active: 'Trial ativo',
  trial_not_converted: 'Trial não convertido',
  active_customer: 'Cliente ativo',
  past_due: 'Inadimplente',
  expired_involuntary: 'Expirado por inadimplência',
  cancelled: 'Cancelado',
  no_subscription: 'Cadastrado (sem trial)',
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const filters = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // Client com o JWT de quem chamou — a checagem de admin acontece DENTRO
  // do RPC (_require_platform_admin), nunca confiando só na rota do front.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

  const { data, error } = await callerClient.rpc('admin_list_leads_system', {
    p_search: filters.search ?? null,
    p_status: filters.status ?? null,
    p_plan_id: filters.planId ?? null,
    p_billing_interval: filters.billingInterval ?? null,
    p_signup_from: filters.signupFrom ?? null,
    p_signup_to: filters.signupTo ?? null,
    p_coupon_code: filters.couponCode ?? null,
    p_utm_source: filters.utmSource ?? null,
    p_utm_campaign: filters.utmCampaign ?? null,
    p_marketing_email: filters.marketingEmail ?? null,
    p_marketing_whatsapp: filters.marketingWhatsapp ?? null,
    p_inactive_days: filters.inactiveDays ?? null,
    p_include_deleted: filters.includeDeleted ?? false,
    p_limit: 20000,
    p_offset: 0,
  })

  if (error) {
    if (error.message?.includes('NOT_PLATFORM_ADMIN')) return json({ error: 'forbidden' }, 403)
    console.error('admin-export-leads: falha ao consultar leads.', error)
    return json({ error: 'query_failed', detail: error.message }, 500)
  }

  const items = (data as { items: Record<string, unknown>[] })?.items ?? []

  const columns = [
    'full_name', 'email', 'whatsapp', 'instagram', 'company_name',
    'plan_name', 'billing_interval', 'commercial_status_label',
    'created_at', 'last_activity_at', 'coupon_code_at_signup',
    'utm_source', 'utm_campaign', 'marketing_email_opt_in', 'marketing_whatsapp_opt_in',
  ]
  const header = ['Nome', 'E-mail', 'WhatsApp', 'Instagram', 'Marca', 'Plano', 'Ciclo', 'Status comercial', 'Cadastro', 'Última atividade', 'Cupom de entrada', 'UTM Origem', 'UTM Campanha', 'Marketing E-mail', 'Marketing WhatsApp']

  const rows = items.map((it) => {
    const row = { ...it, commercial_status_label: COMMERCIAL_STATUS_LABEL[it.commercial_status as string] ?? it.commercial_status }
    return columns.map((c) => csvEscape(row[c])).join(',')
  })

  const csv = [header.join(','), ...rows].join('\n')

  // Auditoria — só é alcançado se a checagem de admin acima passou.
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData } = await callerClient.auth.getUser()
  await admin.from('audit_logs').insert({
    workspace_id: null,
    user_id: userData?.user?.id ?? null,
    action: 'admin_leads_csv_exported',
    resource_type: 'lead_export',
    resource_id: null,
    metadata: { filters, row_count: items.length },
  })

  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})
