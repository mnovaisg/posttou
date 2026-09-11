import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchExecutiveDashboard, setRevenueGoal } from '@/features/admin/executiveApi'
import { Spinner } from '@/components/ui/spinner'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function monthLabel(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
function currentMonthIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

function FunnelStep({ label, value, pct }: { label: string; value: number; pct: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{value}</span>
      <span className="text-xs text-ink-400">{label}</span>
      {pct !== null && <span className="text-[11px] text-ink-400">{pct}%</span>}
    </div>
  )
}

export function AdminExecutiveDashboardPage() {
  const queryClient = useQueryClient()
  const [editingGoal, setEditingGoal] = React.useState(false)
  const [goalInput, setGoalInput] = React.useState('')
  const [goalError, setGoalError] = React.useState<string | null>(null)
  const [goalBusy, setGoalBusy] = React.useState(false)

  const dashboardQuery = useQuery({ queryKey: ['admin-executive-dashboard'], queryFn: fetchExecutiveDashboard })
  const d = dashboardQuery.data

  async function handleSaveGoal() {
    setGoalError(null)
    const reais = Number(goalInput.replace(',', '.'))
    if (!Number.isFinite(reais) || reais < 0) {
      setGoalError('Informe um valor válido.')
      return
    }
    setGoalBusy(true)
    try {
      await setRevenueGoal(currentMonthIso(), Math.round(reais * 100))
      await queryClient.invalidateQueries({ queryKey: ['admin-executive-dashboard'] })
      setEditingGoal(false)
    } catch {
      setGoalError('Não foi possível salvar a meta.')
    } finally {
      setGoalBusy(false)
    }
  }

  const maxMonthCents = Math.max(1, ...(d?.revenue_by_month ?? []).map((p) => p.received_cents))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Dashboard executivo</h1>
        <p className="mt-1 text-sm text-ink-500">Visão geral do negócio — todos os números vêm das mesmas fontes já usadas em Financeiro e Clientes &amp; Leads.</p>
      </div>

      {dashboardQuery.isLoading && <p className="flex items-center gap-2 text-sm text-ink-400"><Spinner size="xs" />Carregando…</p>}
      {dashboardQuery.isError && <p className="text-sm text-danger-500">Não foi possível carregar o dashboard.</p>}

      {d && (
        <>
          {/* Saúde do negócio */}
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">Saúde do negócio</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Receita recebida no mês" value={formatCents(d.health.received_month_cents)} />
              <MetricCard label="MRR" value={formatCents(d.health.mrr_cents)} />
              <MetricCard label="Clientes ativos" value={String(d.health.active_customers)} />
              <MetricCard label="Trials ativos" value={String(d.health.trial_active)} />
            </div>
          </div>

          {/* Comercial */}
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">Comercial</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Novos clientes pagos no mês" value={String(d.commercial.new_paid_customers_month)} hint="Primeira ativação (activated_at) no mês" />
              <MetricCard label="Novos cadastros no mês" value={String(d.commercial.new_signups_month)} />
              <MetricCard label="Conversão Trial → Pago" value={`${d.commercial.trial_to_customer_conversion_pct}%`} hint="Histórico, todos os organizações" />
              <Link to="/admin/financeiro">
                <MetricCard label="Inadimplentes" value={String(d.commercial.past_due)} />
              </Link>
            </div>
          </div>

          {/* Meta mensal */}
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Meta mensal ({monthLabel(d.goal.month)})</h2>
              {!editingGoal && (
                <button
                  type="button"
                  className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                  onClick={() => {
                    setGoalInput(d.goal.goal_cents !== null ? String(d.goal.goal_cents / 100) : '')
                    setEditingGoal(true)
                  }}
                >
                  {d.goal.goal_cents !== null ? 'Editar meta' : 'Definir meta'}
                </button>
              )}
            </div>

            {editingGoal ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
                  placeholder="Meta em R$"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                />
                <button
                  type="button"
                  disabled={goalBusy}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                  onClick={handleSaveGoal}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                  onClick={() => setEditingGoal(false)}
                >
                  Cancelar
                </button>
                {goalError && <span className="text-xs text-danger-500">{goalError}</span>}
              </div>
            ) : d.goal.goal_cents === null ? (
              <p className="text-sm text-ink-400">Nenhuma meta definida para este mês.</p>
            ) : (
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{formatCents(d.goal.realized_cents)}</span>
                  <span className="text-sm text-ink-400">de {formatCents(d.goal.goal_cents)}</span>
                  <span className="text-sm font-medium text-brand-600 dark:text-brand-400">{d.goal.pct ?? 0}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, d.goal.pct ?? 0)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Gráfico receita últimos 6 meses */}
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Receita recebida (últimos 6 meses)</h2>
            <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
              {d.revenue_by_month.map((p) => (
                <div key={p.month} className="flex shrink-0 flex-col items-center gap-1">
                  <div
                    title={formatCents(p.received_cents)}
                    className="w-6 rounded-t bg-green-500"
                    style={{ height: `${Math.max(2, (p.received_cents / maxMonthCents) * 128)}px` }}
                  />
                  <span className="text-[10px] text-ink-400">{monthLabel(p.month)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Funil comercial */}
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Funil comercial: Cadastro → Trial → Cliente pago</h2>
            <div className="flex flex-wrap items-center justify-around gap-3">
              <FunnelStep label="Cadastro" value={d.funil_comercial.signups} pct={null} />
              <span className="text-ink-300">→</span>
              <FunnelStep
                label="Trial"
                value={d.funil_comercial.trials}
                pct={d.funil_comercial.signups > 0 ? Math.round((d.funil_comercial.trials / d.funil_comercial.signups) * 1000) / 10 : null}
              />
              <span className="text-ink-300">→</span>
              <FunnelStep
                label="Cliente pago"
                value={d.funil_comercial.paid_customers}
                pct={d.funil_comercial.trials > 0 ? Math.round((d.funil_comercial.paid_customers / d.funil_comercial.trials) * 1000) / 10 : null}
              />
            </div>
            {!d.funil_comercial.monotonic && (
              <p className="mt-3 rounded-lg bg-danger-50 p-2 text-xs text-danger-700 dark:bg-danger-950 dark:text-danger-400">
                Inconsistência de dados: o funil comercial deveria ser sempre decrescente (Cadastro ≥ Trial ≥ Pago). Isso indica um problema real nos dados e
                precisa ser investigado.
              </p>
            )}
          </div>

          {/* Ativação do produto */}
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-400">Ativação do produto</h2>
            <p className="mb-3 text-xs text-ink-400">
              Percentual sobre {d.ativacao_produto.denominator} {d.ativacao_produto.denominator_label} — passos de ativação, não etapas obrigatórias do funil comercial.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <FunnelStep label="DNA concluído" value={d.ativacao_produto.dna_completed.count} pct={d.ativacao_produto.dna_completed.pct} />
              <FunnelStep label="Instagram conectado" value={d.ativacao_produto.instagram_connected.count} pct={d.ativacao_produto.instagram_connected.pct} />
            </div>
          </div>

          {/* Distribuição por plano */}
          <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Distribuição por plano</h2>
            <div className="flex flex-col gap-2">
              {d.revenue_by_plan.map((p) => (
                <div key={p.plan_id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-ink-700 dark:text-ink-200">{p.plan_name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.share_pct}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-ink-400">{p.share_pct}%</span>
                  <span className="w-24 shrink-0 text-right text-xs text-ink-500">{formatCents(p.mrr_cents)}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-ink-400">{p.active_customers} cli.</span>
                </div>
              ))}
              {d.revenue_by_plan.length === 0 && <p className="text-sm text-ink-400">Nenhum cliente recorrente no momento.</p>}
            </div>
          </div>

          {/* Alertas executivos */}
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">Alertas executivos</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link to="/admin/clientes" className="rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Trials vencendo (48h)</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{d.alerts.trials_ending_48h}</p>
              </Link>
              <Link to="/admin/financeiro" className="rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Inadimplentes</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{d.alerts.past_due}</p>
              </Link>
              <Link to="/admin/clientes" className="rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Follow-ups vencidos</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{d.alerts.follow_ups_due}</p>
              </Link>
              <Link to="/admin/financeiro" className="rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Problemas de sincronização Asaas</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{d.alerts.asaas_sync_issues}</p>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
