import { useQuery } from '@tanstack/react-query'
import { fetchAdminDashboardMetrics } from '@/features/admin/api'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AdminDashboardPage() {
  const metricsQuery = useQuery({ queryKey: ['admin-dashboard-metrics'], queryFn: fetchAdminDashboardMetrics })

  const m = metricsQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Painel administrativo</h1>
        <p className="mt-1 text-sm text-ink-500">Métricas reais de cupons — nada aqui é estimado.</p>
      </div>

      {metricsQuery.isLoading && <p className="text-sm text-ink-400">Carregando…</p>}
      {metricsQuery.isError && <p className="text-sm text-danger-500">Não foi possível carregar as métricas.</p>}

      {m && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Cupons ativos" value={String(m.active_coupons)} />
          <MetricCard label="Cupons expirados" value={String(m.expired_coupons)} />
          <MetricCard label="Total de utilizações" value={String(m.total_redemptions)} />
          <MetricCard label="Desconto total concedido" value={formatCents(m.total_discount_granted_cents)} />
          <MetricCard label="Assinaturas originadas com cupom" value={String(m.subscriptions_originated_with_coupon)} />
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{value}</p>
    </div>
  )
}
