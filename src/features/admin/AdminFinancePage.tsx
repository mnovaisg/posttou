import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFinancialSummary,
  fetchRecurringRevenue,
  fetchRevenueByMonth,
  fetchRevenueProjection,
  fetchRevenueByPlan,
  fetchDiscountsSummary,
  fetchUpcomingReceivables,
  fetchRevenueLost,
  fetchBillingCharges,
  runBillingBackfill,
  CHARGE_STATUS_LABEL,
  CHARGE_STATUS_COLOR,
} from '@/features/admin/financeApi'
import type { ChargeStatus, BackfillSummary } from '@/features/admin/financeApi'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function monthLabel(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

type PeriodKey = 'this_month' | 'last_month' | 'next_month' | 'this_year' | 'custom'

function periodRange(key: PeriodKey, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (key === 'this_month') return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)), label: 'Este mês' }
  if (key === 'last_month') return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)), label: 'Mês anterior' }
  if (key === 'next_month') return { start: ymd(new Date(y, m + 1, 1)), end: ymd(new Date(y, m + 2, 0)), label: 'Próximo mês' }
  if (key === 'this_year') return { start: ymd(new Date(y, 0, 1)), end: ymd(new Date(y, 11, 31)), label: 'Este ano' }
  return { start: customStart || ymd(new Date(y, m, 1)), end: customEnd || ymd(new Date(y, m + 1, 0)), label: 'Personalizado' }
}

const PAGE_SIZE = 20

export function AdminFinancePage() {
  const queryClient = useQueryClient()
  const [periodKey, setPeriodKey] = React.useState<PeriodKey>('this_month')
  const [customStart, setCustomStart] = React.useState('')
  const [customEnd, setCustomEnd] = React.useState('')
  const [chartMonths, setChartMonths] = React.useState<6 | 12>(6)
  const [projectionMonths, setProjectionMonths] = React.useState<3 | 6 | 12>(3)
  const [chargeStatus, setChargeStatus] = React.useState<ChargeStatus | ''>('')
  const [chargeSearch, setChargeSearch] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [backfillBusy, setBackfillBusy] = React.useState(false)
  const [backfillResult, setBackfillResult] = React.useState<BackfillSummary | null>(null)
  const [backfillError, setBackfillError] = React.useState<string | null>(null)

  const period = periodRange(periodKey, customStart, customEnd)
  const isFuturePeriod = new Date(period.start) > new Date()

  const summaryQuery = useQuery({ queryKey: ['fin-summary', period.start, period.end], queryFn: () => fetchFinancialSummary(period.start, period.end) })
  const recurringQuery = useQuery({ queryKey: ['fin-recurring'], queryFn: fetchRecurringRevenue })
  const revenueByMonthQuery = useQuery({ queryKey: ['fin-by-month', chartMonths], queryFn: () => fetchRevenueByMonth(chartMonths) })
  const projectionQuery = useQuery({ queryKey: ['fin-projection', projectionMonths], queryFn: () => fetchRevenueProjection(projectionMonths) })
  const byPlanQuery = useQuery({ queryKey: ['fin-by-plan'], queryFn: fetchRevenueByPlan })
  const discountsQuery = useQuery({ queryKey: ['fin-discounts', period.start, period.end], queryFn: () => fetchDiscountsSummary(period.start, period.end) })
  const receivablesQuery = useQuery({ queryKey: ['fin-receivables'], queryFn: () => fetchUpcomingReceivables(60) })
  const lostQuery = useQuery({ queryKey: ['fin-lost', period.start, period.end], queryFn: () => fetchRevenueLost(period.start, period.end) })
  const chargesQuery = useQuery({
    queryKey: ['fin-charges', chargeStatus, chargeSearch, page],
    queryFn: () => fetchBillingCharges({ status: chargeStatus, search: chargeSearch || undefined }, PAGE_SIZE, page * PAGE_SIZE),
  })

  const s = summaryQuery.data
  const rec = recurringQuery.data
  const lost = lostQuery.data
  const charges = chargesQuery.data?.items ?? []
  const chargesTotal = chargesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(chargesTotal / PAGE_SIZE))

  const maxMonthCents = Math.max(1, ...(revenueByMonthQuery.data ?? []).flatMap((p) => [p.received_cents, p.issued_cents]))
  const maxProjCents = Math.max(1, ...(projectionQuery.data ?? []).map((p) => p.projected_cents))

  async function handleBackfill() {
    setBackfillBusy(true)
    setBackfillError(null)
    setBackfillResult(null)
    try {
      const summary = await runBillingBackfill()
      setBackfillResult(summary)
      await queryClient.invalidateQueries({ queryKey: ['fin-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['fin-by-month'] })
      await queryClient.invalidateQueries({ queryKey: ['fin-charges'] })
      await queryClient.invalidateQueries({ queryKey: ['fin-receivables'] })
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Erro ao sincronizar.')
    } finally {
      setBackfillBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Financeiro</h1>
          <p className="mt-1 text-sm text-ink-500">Saúde financeira do POSTTOU — caixa, cobrança, recorrência e projeção.</p>
        </div>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={backfillBusy}
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
        >
          {backfillBusy ? 'Sincronizando com o Asaas…' : 'Sincronizar histórico do Asaas'}
        </button>
      </div>

      {backfillError && <p className="text-sm text-danger-500">{backfillError}</p>}
      {backfillResult && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm dark:border-brand-900 dark:bg-brand-950">
          <p className="font-medium text-brand-900 dark:text-brand-200">
            Sincronização concluída: {backfillResult.organizations_scanned} organizações verificadas, {backfillResult.payments_imported} cobranças novas, {backfillResult.payments_updated} atualizadas, {backfillResult.payments_skipped} não associadas com segurança.
          </p>
          {backfillResult.unassociated.length > 0 && (
            <p className="mt-1 text-xs text-brand-800 dark:text-brand-300">
              Não associadas: {backfillResult.unassociated.slice(0, 5).map((u) => `${u.asaas_payment_id} (${u.reason})`).join(', ')}
              {backfillResult.unassociated.length > 5 ? ` e mais ${backfillResult.unassociated.length - 5}…` : ''}
            </p>
          )}
          {backfillResult.errors.length > 0 && (
            <p className="mt-1 text-xs text-danger-500">{backfillResult.errors.length} erro(s) — veja audit_logs para detalhes.</p>
          )}
        </div>
      )}

      {/* Seletor de período */}
      <div className="flex flex-wrap items-center gap-2">
        {(['this_month', 'last_month', 'next_month', 'this_year', 'custom'] as PeriodKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPeriodKey(k)}
            className={
              periodKey === k
                ? 'rounded-full border border-brand-600 bg-brand-600 px-3 py-1 text-xs font-semibold text-white'
                : 'rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
            }
          >
            {periodRange(k).label}
          </button>
        ))}
        {periodKey === 'custom' && (
          <>
            <input type="date" className="rounded-lg border border-ink-200 px-2 py-1 text-xs dark:border-ink-800 dark:bg-ink-950" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="text-xs text-ink-400">até</span>
            <input type="date" className="rounded-lg border border-ink-200 px-2 py-1 text-xs dark:border-ink-800 dark:bg-ink-950" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
        <span className="text-xs text-ink-400">{formatDate(period.start)} – {formatDate(period.end)}</span>
      </div>

      {/* Cards principais — CAIXA x COBRANÇA nunca misturados */}
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-xs text-ink-400">{isFuturePeriod && !s.has_issued_data ? 'Projetado (sem cobrança emitida ainda)' : 'Cobrado / Emitido no período'}</p>
            <p className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
              {formatCents(s.has_issued_data ? s.issued_cents : s.projected_cents)}
            </p>
            {!s.has_issued_data && s.projected_cents > 0 && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Projeção baseada nas assinaturas atuais — não é cobrança emitida.</p>
            )}
          </div>
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-xs text-ink-400">Recebido (caixa)</p>
            <p className="mt-1 text-xl font-semibold text-green-700 dark:text-green-400">{formatCents(s.received_cents)}</p>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-xs text-ink-400">A receber</p>
            <p className="mt-1 text-xl font-semibold text-blue-700 dark:text-blue-400">{formatCents(s.receivable_cents)}</p>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <p className="text-xs text-ink-400">Inadimplente</p>
            <p className="mt-1 text-xl font-semibold text-red-700 dark:text-red-400">{formatCents(s.overdue_cents)}</p>
          </div>
        </div>
      )}

      {/* Receita recorrente */}
      {rec && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Receita recorrente</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="MRR" value={formatCents(rec.mrr_cents)} />
            <Metric label="ARR" value={formatCents(rec.arr_cents)} />
            <Metric label="Clientes pagantes" value={String(rec.paying_customers)} />
            <Metric label="Ticket médio" value={formatCents(rec.average_ticket_cents)} />
          </div>
        </div>
      )}

      {/* Receita perdida */}
      {lost && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Receita perdida (métrica derivada)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="MRR cancelado no período" value={formatCents(lost.mrr_cancelled_in_period_cents)} />
            <Metric label="MRR em risco (inadimplência agora)" value={formatCents(lost.mrr_at_risk_past_due_cents)} />
          </div>
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{lost.note}</p>
        </div>
      )}

      {/* Gráfico Recebido x Emitido */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Receita por mês</h2>
          <div className="flex gap-1">
            {[6, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChartMonths(n as 6 | 12)}
                className={chartMonths === n ? 'rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white' : 'rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 dark:border-ink-700 dark:text-ink-300'}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
          {(revenueByMonthQuery.data ?? []).map((p) => (
            <div key={p.month} className="flex shrink-0 flex-col items-center gap-1">
              <div className="flex h-32 items-end gap-1">
                <div
                  title={`Recebido: ${formatCents(p.received_cents)}`}
                  className="w-4 rounded-t bg-green-500"
                  style={{ height: `${Math.max(2, (p.received_cents / maxMonthCents) * 128)}px` }}
                />
                <div
                  title={`Emitido: ${formatCents(p.issued_cents)}`}
                  className="w-4 rounded-t bg-blue-300"
                  style={{ height: `${Math.max(2, (p.issued_cents / maxMonthCents) * 128)}px` }}
                />
              </div>
              <span className="text-[10px] text-ink-400">{monthLabel(p.month)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Recebido</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-300" /> Emitido</span>
        </div>
      </div>

      {/* Projeção */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Projeção de receita</h2>
          <div className="flex gap-1">
            {[3, 6, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setProjectionMonths(n as 3 | 6 | 12)}
                className={projectionMonths === n ? 'rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white' : 'rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 dark:border-ink-700 dark:text-ink-300'}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs font-medium text-amber-600 dark:text-amber-400">Projeção baseada nas assinaturas atuais — churn, novos clientes e inadimplência futura podem alterar o resultado.</p>
        <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
          {(projectionQuery.data ?? []).map((p) => (
            <div key={p.month} className="flex shrink-0 flex-col items-center gap-1">
              <span className="text-[10px] text-ink-500">{formatCents(p.projected_cents)}</span>
              <div
                className="w-6 rounded-t bg-purple-300"
                style={{ height: `${Math.max(2, (p.projected_cents / maxProjCents) * 100)}px` }}
              />
              <span className="text-[10px] text-ink-400">{monthLabel(p.month)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Receita por plano */}
      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
        <h2 className="p-4 pb-0 text-sm font-semibold uppercase tracking-wide text-ink-400">Receita por plano</h2>
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Clientes ativos</th>
              <th className="px-4 py-3">MRR</th>
              <th className="px-4 py-3">Participação</th>
              <th className="px-4 py-3">Mensal</th>
              <th className="px-4 py-3">Anual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {(byPlanQuery.data ?? []).map((p) => (
              <tr key={p.plan_id}>
                <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">{p.plan_name}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{p.active_customers}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{formatCents(p.mrr_cents)}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{p.share_pct}%</td>
                <td className="px-4 py-3 text-xs text-ink-500">{p.customers_monthly} cli · {formatCents(p.mrr_monthly_cents)}</td>
                <td className="px-4 py-3 text-xs text-ink-500">{p.customers_yearly} cli · {formatCents(p.mrr_yearly_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Descontos */}
      {discountsQuery.data && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Descontos concedidos no período</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="Valor bruto" value={formatCents(discountsQuery.data.gross_cents)} />
            <Metric label="Descontos" value={formatCents(discountsQuery.data.discount_cents)} />
            <Metric label="Valor líquido" value={formatCents(discountsQuery.data.net_cents)} />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-ink-500">
            <span>1ª cobrança: {formatCents(discountsQuery.data.discount_first_payment_cents)}</span>
            <span>Recorrente: {formatCents(discountsQuery.data.discount_recurring_cents)}</span>
          </div>
        </div>
      )}

      {/* Próximos recebimentos */}
      {receivablesQuery.data && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Próximos recebimentos previstos (60 dias)</h2>
          {receivablesQuery.data.items.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhuma cobrança em aberto nos próximos 60 dias (ou o histórico ainda não foi sincronizado).</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {receivablesQuery.data.items.slice(0, 15).map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-600 dark:text-ink-300">{formatDate(it.due_date)} — {it.organization_name}</span>
                    <span className="font-medium text-ink-900 dark:text-ink-50">{formatCents(it.amount_cents)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 border-t border-ink-100 pt-3 text-xs text-ink-500 dark:border-ink-800">
                {receivablesQuery.data.by_month.map((m) => (
                  <span key={m.month}>{monthLabel(m.month)}: <strong className="text-ink-700 dark:text-ink-200">{formatCents(m.cents)}</strong></span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cobranças */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Cobranças</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
              placeholder="Cliente ou e-mail"
              value={chargeSearch}
              onChange={(e) => { setChargeSearch(e.target.value); setPage(0) }}
            />
            <select
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
              value={chargeStatus}
              onChange={(e) => { setChargeStatus(e.target.value as ChargeStatus | ''); setPage(0) }}
            >
              <option value="">Status: todos</option>
              {Object.entries(CHARGE_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400 dark:bg-ink-900">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Valor original</th>
                <th className="px-4 py-3">Desconto</th>
                <th className="px-4 py-3">Valor final</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {charges.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/clientes/${c.organization_id}`} className="font-medium text-ink-900 hover:underline dark:text-ink-50">
                      {c.organization_name}
                    </Link>
                    <p className="text-xs text-ink-400">{c.owner_email}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{c.plan_name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{c.original_amount_cents === null ? 'Desconhecido' : formatCents(c.original_amount_cents)}</td>
                  <td className="px-4 py-3 text-ink-500">{c.discount_amount_cents === null ? 'Desconhecido' : formatCents(c.discount_amount_cents)}</td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">{formatCents(c.final_amount_cents)}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(c.due_date)}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(c.paid_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHARGE_STATUS_COLOR[c.status]}`}>{CHARGE_STATUS_LABEL[c.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {charges.length === 0 && !chargesQuery.isLoading && <p className="p-4 text-sm text-ink-400">Nenhuma cobrança encontrada — sincronize o histórico do Asaas ou aguarde o primeiro webhook.</p>}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-40 dark:border-ink-700">Anterior</button>
            <span className="text-ink-500">Página {page + 1} de {totalPages} · {chargesTotal} no total</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-40 dark:border-ink-700">Próxima</button>
          </div>
        )}
      </div>

      {/* Inadimplência — link pro CRM, sem duplicar dados */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Inadimplentes</h2>
        <p className="text-sm text-red-800 dark:text-red-300">
          Perfis completos (contato, jornada, dias em atraso) já disponíveis em Clientes & Leads.
        </p>
        <Link to="/admin/clientes?status=past_due" className="mt-2 inline-block text-sm font-medium text-red-700 hover:underline dark:text-red-400">
          Ver inadimplentes em Clientes & Leads →
        </Link>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink-900 dark:text-ink-50">{value}</p>
    </div>
  )
}
