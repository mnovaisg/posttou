import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlans } from '@/features/billing/api'
import { createAdminCoupon, fetchAdminCouponDetail, updateAdminCoupon } from '@/features/admin/api'
import type { CouponFormInput } from '@/features/admin/api'

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}
function fromDateTimeLocal(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

export function AdminCouponFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const plansQuery = useQuery({ queryKey: ['billing-plans'], queryFn: fetchPlans })
  const detailQuery = useQuery({
    queryKey: ['admin-coupon-detail', id],
    queryFn: () => fetchAdminCouponDetail(id!),
    enabled: isEdit,
  })

  const [form, setForm] = React.useState<CouponFormInput>({
    code: '',
    discountType: 'percentage',
    discountValue: 10,
    duration: 'first_payment',
    eligiblePlanIds: null,
    eligibleBillingIntervals: null,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    maxRedemptionsPerOrganization: 1,
    active: true,
  })
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (detailQuery.data) {
      const c = detailQuery.data.coupon
      setForm({
        code: c.code,
        discountType: c.discount_type,
        discountValue: Number(c.discount_value),
        duration: c.duration,
        eligiblePlanIds: c.eligible_plan_ids,
        eligibleBillingIntervals: c.eligible_billing_intervals,
        startsAt: c.starts_at,
        expiresAt: c.expires_at,
        maxRedemptions: c.max_redemptions,
        maxRedemptionsPerOrganization: c.max_redemptions_per_organization,
        active: c.active,
      })
    }
  }, [detailQuery.data])

  const hasBeenUsed = (detailQuery.data?.coupon.used_count ?? 0) > 0
  const dangerousFieldsLocked = isEdit && hasBeenUsed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (isEdit) {
        await updateAdminCoupon(id!, form)
      } else {
        await createAdminCoupon(form)
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-coupons'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-dashboard-metrics'] })
      navigate('/admin/cupons')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setSaving(false)
    }
  }

  function togglePlan(planId: string) {
    setForm((f) => {
      const current = f.eligiblePlanIds ?? []
      const next = current.includes(planId) ? current.filter((p) => p !== planId) : [...current, planId]
      return { ...f, eligiblePlanIds: next.length === 0 ? null : next }
    })
  }

  function toggleInterval(interval: 'monthly' | 'yearly') {
    setForm((f) => {
      const current = f.eligibleBillingIntervals ?? []
      const next = current.includes(interval) ? current.filter((i) => i !== interval) : [...current, interval]
      return { ...f, eligibleBillingIntervals: next.length === 0 ? null : next }
    })
  }

  if (isEdit && detailQuery.isLoading) return <p className="text-sm text-ink-400">Carregando…</p>

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{isEdit ? 'Editar cupom' : 'Criar cupom'}</h1>

      {dangerousFieldsLocked && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Este cupom já foi usado ({detailQuery.data?.coupon.used_count} vez(es)). Tipo de desconto, valor, duração, planos
          elegíveis e ciclos elegíveis não podem mais ser alterados — nunca mudamos retroativamente o que já foi cobrado. Crie
          um novo cupom se precisar de regras diferentes.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Código</label>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm uppercase disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900"
            value={form.code}
            disabled={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Tipo de desconto</label>
            <select
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900"
              value={form.discountType}
              disabled={dangerousFieldsLocked}
              onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as 'percentage' | 'fixed' }))}
            >
              <option value="percentage">Percentual (%)</option>
              <option value="fixed">Valor fixo (centavos)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">
              Valor {form.discountType === 'percentage' ? '(%)' : '(centavos)'}
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900"
              value={form.discountValue}
              disabled={dangerousFieldsLocked}
              onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Duração</label>
          <p className="mt-0.5 text-xs text-ink-400">
            Define até quando o desconto vale para quem usar o cupom: só na primeira cobrança, ou em todas as cobranças
            futuras enquanto a assinatura continuar.
          </p>
          <select
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900"
            value={form.duration}
            disabled={dangerousFieldsLocked}
            onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value as 'first_payment' | 'recurring' }))}
          >
            <option value="first_payment">Só a 1ª cobrança</option>
            <option value="recurring">Todos os ciclos (recorrente)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Planos elegíveis (vazio = todos)</label>
          <p className="mt-0.5 text-xs text-ink-400">
            Restringe o cupom a um ou mais planos específicos (ex.: só Profissional). Sem nenhum selecionado, o cupom vale
            para qualquer plano.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {plansQuery.data?.map((p) => (
              <button
                type="button"
                key={p.id}
                disabled={dangerousFieldsLocked}
                onClick={() => togglePlan(p.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 ${
                  form.eligiblePlanIds?.includes(p.id)
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                    : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Ciclos elegíveis (vazio = todos)</label>
          <p className="mt-0.5 text-xs text-ink-400">
            Restringe o cupom à cobrança Mensal, à Anual, ou às duas. Ex.: marcar só "Anual" faz o cupom funcionar apenas
            para quem assinar no ciclo anual — útil para promoções que incentivam o plano anual.
          </p>
          <div className="mt-1 flex gap-2">
            {(['monthly', 'yearly'] as const).map((interval) => (
              <button
                type="button"
                key={interval}
                disabled={dangerousFieldsLocked}
                onClick={() => toggleInterval(interval)}
                className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 ${
                  form.eligibleBillingIntervals?.includes(interval)
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                    : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300'
                }`}
              >
                {interval === 'monthly' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Início (opcional)</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900"
              value={toDateTimeLocal(form.startsAt)}
              disabled={dangerousFieldsLocked}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: fromDateTimeLocal(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Expiração (opcional)</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
              value={toDateTimeLocal(form.expiresAt)}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: fromDateTimeLocal(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Limite total (vazio = ilimitado)</label>
            <p className="mt-0.5 text-xs text-ink-400">Quantas vezes este cupom pode ser usado no total, somando todas as organizações.</p>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
              value={form.maxRedemptions ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Limite por organização</label>
            <p className="mt-0.5 text-xs text-ink-400">Quantas vezes uma mesma organização pode usar este cupom (normalmente 1).</p>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
              value={form.maxRedemptionsPerOrganization}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptionsPerOrganization: Number(e.target.value) }))}
              required
            />
          </div>
        </div>

        {!isEdit && (
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Ativo desde a criação
          </label>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar cupom'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200"
            onClick={() => navigate(-1)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
