import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  COMMERCIAL_STATUS_COLOR,
  COMMERCIAL_STATUS_LABEL,
  exportAdminLeadsCsv,
  fetchAdminLeadMetrics,
  fetchAdminLeads,
} from '@/features/admin/api'
import type { AdminLeadFilters, CommercialStatus } from '@/features/admin/api'
import { fetchPlans } from '@/features/billing/api'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}
function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—'
}

const PAGE_SIZE = 25

// Sempre lê/escreve direto nos mesmos campos de `filters` — nunca um
// estado visual paralelo. `isActive` é sempre derivado do filtro real,
// então o botão nunca pode ficar dessincronizado da query.
function setFilterField<K extends keyof AdminLeadFilters>(
  f: AdminLeadFilters,
  key: K,
  value: AdminLeadFilters[K] | undefined,
): AdminLeadFilters {
  const next = { ...f }
  if (value === undefined || value === ('' as unknown)) {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}

function hasActiveFilters(f: AdminLeadFilters): boolean {
  return Object.values(f).some((v) => v !== undefined && v !== null && v !== '')
}

interface QuickFilterDef {
  label: string
  isActive: (f: AdminLeadFilters) => boolean
  toggle: (f: AdminLeadFilters) => AdminLeadFilters
}

// Os 5 primeiros compartilham o campo `status` — por isso já são
// mutuamente exclusivos entre si (escolher um troca o anterior). Os 3
// últimos são campos independentes e combinam livremente com status e
// entre si. Clicar de novo no mesmo filtro ativo sempre remove só ele.
function statusQuickFilter(label: string, status: CommercialStatus): QuickFilterDef {
  return {
    label,
    isActive: (f) => f.status === status,
    toggle: (f) => setFilterField(f, 'status', f.status === status ? undefined : status),
  }
}

const QUICK_FILTERS: QuickFilterDef[] = [
  statusQuickFilter('Trial não convertido', 'trial_not_converted'),
  statusQuickFilter('Inadimplentes', 'past_due'),
  statusQuickFilter('Expirados por inadimplência', 'expired_involuntary'),
  statusQuickFilter('Cancelados', 'cancelled'),
  statusQuickFilter('Clientes ativos', 'active_customer'),
  {
    label: 'Sem atividade há 14 dias',
    isActive: (f) => f.inactiveDays === 14,
    toggle: (f) => setFilterField(f, 'inactiveDays', f.inactiveDays === 14 ? undefined : 14),
  },
  {
    label: 'Aceita marketing e-mail',
    isActive: (f) => f.marketingEmail === true,
    toggle: (f) => setFilterField(f, 'marketingEmail', f.marketingEmail === true ? undefined : true),
  },
  {
    label: 'Usou cupom',
    isActive: (f) => f.couponCode === '%',
    toggle: (f) => setFilterField(f, 'couponCode', f.couponCode === '%' ? undefined : '%'),
  },
]

export function AdminLeadsPage() {
  const [filters, setFilters] = React.useState<AdminLeadFilters>({})
  const [searchInput, setSearchInput] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const metricsQuery = useQuery({ queryKey: ['admin-lead-metrics'], queryFn: fetchAdminLeadMetrics })
  const plansQuery = useQuery({ queryKey: ['billing-plans'], queryFn: fetchPlans })
  const listQuery = useQuery({
    queryKey: ['admin-leads', filters, page],
    queryFn: () => fetchAdminLeads(filters, PAGE_SIZE, page * PAGE_SIZE),
  })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function applyFilters(next: AdminLeadFilters) {
    setFilters(next)
    setPage(0)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    applyFilters({ ...filters, search: searchInput.trim() || undefined })
  }

  function clearFilters() {
    setSearchInput('')
    applyFilters({})
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await exportAdminLeadsCsv(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clientes-leads-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao exportar.')
    } finally {
      setExporting(false)
    }
  }

  const m = metricsQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Clientes & Leads</h1>
          <p className="mt-1 text-sm text-ink-500">Jornada comercial completa — do cadastro ao cancelamento.</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {exporting ? 'Exportando…' : 'Exportar CSV (filtro atual)'}
        </button>
      </div>
      {exportError && <p className="text-sm text-danger-500">{exportError}</p>}

      {/* Cards de resumo */}
      {m && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total de leads" value={m.total_leads} />
          <MetricCard label="Trial ativo" value={m.trial_active} />
          <MetricCard label="Trial não convertido" value={m.trial_not_converted} />
          <MetricCard label="Cliente ativo" value={m.active_customers} />
          <MetricCard label="Inadimplente" value={m.past_due} />
          <MetricCard label="Expirado por inadimplência" value={m.expired_involuntary} />
          <MetricCard label="Cancelado" value={m.cancelled} />
          <MetricCard label="Conversão Trial → Cliente" value={`${m.trial_to_customer_conversion_pct}%`} />
        </div>
      )}

      {/* Funil */}
      {m && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Funil comercial</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <FunnelStep label="Cadastros" value={m.funnel.signups} />
            <span className="text-ink-300">→</span>
            <FunnelStep
              label="Trials"
              value={m.funnel.trials}
              pct={m.funnel.signups > 0 ? Math.round((m.funnel.trials / m.funnel.signups) * 1000) / 10 : null}
            />
            <span className="text-ink-300">→</span>
            <FunnelStep
              label="Clientes pagos"
              value={m.funnel.paid_customers}
              pct={m.funnel.trials > 0 ? Math.round((m.funnel.paid_customers / m.funnel.trials) * 1000) / 10 : null}
            />
          </div>
          <p className="mt-3 text-xs text-ink-400">
            MRR bruto: <span className="font-medium text-ink-700 dark:text-ink-200">{formatCents(m.mrr_gross_cents)}</span>
            {m.mrr_recurring_discount_cents > 0 && (
              <> · desconto recorrente ativo: −{formatCents(m.mrr_recurring_discount_cents)}</>
            )}
          </p>
        </div>
      )}

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((qf) => {
          const active = qf.isActive(filters)
          return (
            <button
              key={qf.label}
              type="button"
              aria-pressed={active}
              onClick={() => applyFilters(qf.toggle(filters))}
              className={
                active
                  ? 'flex items-center gap-1 rounded-full border border-brand-600 bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-sm'
                  : 'rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
              }
            >
              {active && <span aria-hidden="true">✓</span>}
              {qf.label}
            </button>
          )
        })}
        {hasActiveFilters(filters) && (
          <button type="button" onClick={clearFilters} className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 dark:border-red-900">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filtros detalhados */}
      <div className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <form className="flex gap-2" onSubmit={handleSearchSubmit}>
          <input
            className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
            placeholder="Nome, e-mail, whatsapp, instagram ou marca"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200">
            Buscar
          </button>
        </form>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            value={filters.status ?? ''}
            onChange={(e) => applyFilters({ ...filters, status: (e.target.value || undefined) as CommercialStatus | undefined })}
          >
            <option value="">Status: todos</option>
            {Object.entries(COMMERCIAL_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            value={filters.planId ?? ''}
            onChange={(e) => applyFilters({ ...filters, planId: e.target.value || undefined })}
          >
            <option value="">Plano: todos</option>
            {plansQuery.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            value={filters.billingInterval ?? ''}
            onChange={(e) => applyFilters({ ...filters, billingInterval: (e.target.value || undefined) as 'monthly' | 'yearly' | undefined })}
          >
            <option value="">Ciclo: todos</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
          <input
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            placeholder="Cupom de entrada"
            value={filters.couponCode ?? ''}
            onChange={(e) => applyFilters({ ...filters, couponCode: e.target.value || undefined })}
          />
          <input
            type="date"
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            value={filters.signupFrom?.slice(0, 10) ?? ''}
            onChange={(e) => applyFilters({ ...filters, signupFrom: e.target.value ? `${e.target.value}T00:00:00Z` : undefined })}
          />
          <input
            type="date"
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            value={filters.signupTo?.slice(0, 10) ?? ''}
            onChange={(e) => applyFilters({ ...filters, signupTo: e.target.value ? `${e.target.value}T23:59:59Z` : undefined })}
          />
          <input
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            placeholder="UTM origem"
            value={filters.utmSource ?? ''}
            onChange={(e) => applyFilters({ ...filters, utmSource: e.target.value || undefined })}
          />
          <input
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            placeholder="UTM campanha"
            value={filters.utmCampaign ?? ''}
            onChange={(e) => applyFilters({ ...filters, utmCampaign: e.target.value || undefined })}
          />
        </div>
      </div>

      {listQuery.isLoading && <p className="text-sm text-ink-400">Carregando…</p>}
      {listQuery.isError && <p className="text-sm text-danger-500">Não foi possível carregar a lista.</p>}

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((it) => (
          <Link
            key={it.organization_id}
            to={`/admin/clientes/${it.organization_id}`}
            className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink-900 dark:text-ink-50">{it.full_name ?? it.email}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COMMERCIAL_STATUS_COLOR[it.commercial_status]}`}>
                {COMMERCIAL_STATUS_LABEL[it.commercial_status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-500">{it.email}</p>
            <p className="mt-1 text-xs text-ink-400">{it.company_name} · {it.plan_name ?? '—'}</p>
            <p className="mt-1 text-xs text-ink-400">Cadastro: {formatDate(it.created_at)}</p>
          </Link>
        ))}
      </div>

      {/* Desktop: tabela — largura mínima real por coluna; o card rola na
          horizontal em vez de espremer/cortar dados (testado em 1024/1280/1440px). */}
      <div className="hidden overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800 sm:block">
        <table className="w-full min-w-[1360px] table-fixed text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400 dark:bg-ink-900">
            <tr>
              <th className="w-[190px] px-4 py-3">Cliente/Lead</th>
              <th className="w-[230px] px-4 py-3">Contato</th>
              <th className="w-[160px] px-4 py-3">Marca</th>
              <th className="w-[190px] px-4 py-3">Status</th>
              <th className="w-[140px] px-4 py-3">Plano</th>
              <th className="w-[170px] px-4 py-3">Financeiro</th>
              <th className="w-[110px] px-4 py-3">Cadastro</th>
              <th className="w-[170px] px-4 py-3">Última atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {items.map((it) => (
              <tr key={it.organization_id} className="hover:bg-ink-50 dark:hover:bg-ink-800/50">
                <td className="break-words px-4 py-3">
                  <Link to={`/admin/clientes/${it.organization_id}`} className="font-medium text-ink-900 hover:underline dark:text-ink-50">
                    {it.full_name ?? '—'}
                  </Link>
                </td>
                <td className="break-words px-4 py-3 text-ink-600 dark:text-ink-300">
                  <div className="flex flex-col">
                    <span>{it.email}</span>
                    {it.whatsapp && <span className="text-xs text-ink-400">{it.whatsapp}</span>}
                  </div>
                </td>
                <td className="break-words px-4 py-3 text-ink-600 dark:text-ink-300">{it.company_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COMMERCIAL_STATUS_COLOR[it.commercial_status]}`}>
                    {COMMERCIAL_STATUS_LABEL[it.commercial_status]}
                  </span>
                </td>
                <td className="break-words px-4 py-3 text-ink-600 dark:text-ink-300">
                  {it.plan_name ?? '—'} {it.billing_interval && <span className="text-xs text-ink-400">({it.billing_interval === 'monthly' ? 'mensal' : 'anual'})</span>}
                </td>
                <td className="break-words px-4 py-3 text-xs text-ink-500">
                  {it.commercial_status === 'past_due' && it.past_due_since
                    ? `Em atraso desde ${formatDate(it.past_due_since)}`
                    : it.commercial_status === 'active_customer'
                      ? 'Em dia'
                      : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDate(it.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-400">{formatDateTime(it.last_activity_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !listQuery.isLoading && <p className="p-4 text-sm text-ink-400">Nenhum resultado para este filtro.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-40 dark:border-ink-700"
          >
            Anterior
          </button>
          <span className="text-ink-500">Página {page + 1} de {totalPages} · {total} no total</span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-40 dark:border-ink-700"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">{value}</p>
    </div>
  )
}

function FunnelStep({ label, value, pct }: { label: string; value: number; pct?: number | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-400">{label}</span>
      <span className="text-lg font-semibold text-ink-900 dark:text-ink-50">
        {value}
        {pct !== undefined && pct !== null && <span className="ml-1 text-xs font-normal text-ink-400">({pct}%)</span>}
      </span>
    </div>
  )
}
