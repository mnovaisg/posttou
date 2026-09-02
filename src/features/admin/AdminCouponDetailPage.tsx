import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteAdminCoupon, fetchAdminCouponDetail, setAdminCouponActive } from '@/features/admin/api'
import { STATUS_LABEL, STATUS_COLOR } from '@/features/admin/statusLabels'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const REDEMPTION_STATUS_LABEL: Record<string, string> = {
  reserved: 'Reservado',
  applied: 'Aplicado',
  failed: 'Falhou',
}

export function AdminCouponDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmingToggle, setConfirmingToggle] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const detailQuery = useQuery({ queryKey: ['admin-coupon-detail', id], queryFn: () => fetchAdminCouponDetail(id!), enabled: !!id })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-coupon-detail', id] })
    await queryClient.invalidateQueries({ queryKey: ['admin-coupons'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-dashboard-metrics'] })
  }

  async function handleToggleActive() {
    if (!detailQuery.data) return
    setBusy(true)
    setError(null)
    try {
      await setAdminCouponActive(id!, !detailQuery.data.coupon.active)
      await refresh()
      setConfirmingToggle(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteAdminCoupon(id!)
      navigate('/admin/cupons')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
      setConfirmingDelete(false)
    } finally {
      setBusy(false)
    }
  }

  if (detailQuery.isLoading) return <p className="text-sm text-ink-400">Carregando…</p>
  if (detailQuery.isError || !detailQuery.data) return <p className="text-sm text-danger-500">Cupom não encontrado.</p>

  const { coupon, redemptions } = detailQuery.data
  const canDelete = coupon.used_count === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-ink-900 dark:text-ink-50">{coupon.code}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[coupon.derived_status]}`}>
            {STATUS_LABEL[coupon.derived_status]}
          </span>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/cupons/${id}/editar`} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200">
            Editar
          </Link>
          <button
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200"
            disabled={busy}
            onClick={() => setConfirmingToggle(true)}
          >
            {coupon.active ? 'Desativar' : 'Ativar'}
          </button>
          {canDelete && (
            <button
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {confirmingToggle && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p>
            {coupon.active
              ? 'Desativar este cupom impede novos usos, mas não afeta usos já concedidos. Confirmar?'
              : 'Reativar este cupom volta a permitir novos usos. Confirmar?'}
          </p>
          <div className="mt-2 flex gap-2">
            <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" disabled={busy} onClick={handleToggleActive}>
              Confirmar
            </button>
            <button className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200" onClick={() => setConfirmingToggle(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p>Excluir este cupom é permanente. Ele nunca foi usado, então nenhum histórico será perdido. Confirmar?</p>
          <div className="mt-2 flex gap-2">
            <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" disabled={busy} onClick={handleDelete}>
              Excluir definitivamente
            </button>
            <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-900 dark:text-red-200" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-ink-200 bg-white p-4 text-sm dark:border-ink-800 dark:bg-ink-900 sm:grid-cols-4">
        <div>
          <p className="text-xs text-ink-400">Desconto</p>
          <p className="font-medium text-ink-900 dark:text-ink-50">
            {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : formatCents(Number(coupon.discount_value))}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">Duração</p>
          <p className="font-medium text-ink-900 dark:text-ink-50">{coupon.duration === 'first_payment' ? '1ª cobrança' : 'Recorrente'}</p>
        </div>
        <div>
          <p className="text-xs text-ink-400">Usos</p>
          <p className="font-medium text-ink-900 dark:text-ink-50">
            {coupon.used_count}
            {coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ''}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">Limite por organização</p>
          <p className="font-medium text-ink-900 dark:text-ink-50">{coupon.max_redemptions_per_organization}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Resgates ({redemptions.length})</h2>
        <div className="flex flex-col gap-2">
          {redemptions.map((r) => (
            <div key={r.id} className="rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-800 dark:bg-ink-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink-900 dark:text-ink-50">{r.organization_name ?? r.organization_id}</span>
                <span className="text-xs text-ink-400">{REDEMPTION_STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {formatCents(r.original_amount_cents)} → {formatCents(r.final_amount_cents)} ({r.plan_id}, {r.billing_interval === 'monthly' ? 'mensal' : 'anual'})
              </p>
              {r.failure_reason && <p className="mt-1 text-xs text-danger-500">{r.failure_reason}</p>}
            </div>
          ))}
          {redemptions.length === 0 && <p className="text-sm text-ink-400">Nenhum resgate ainda.</p>}
        </div>
      </div>
    </div>
  )
}
