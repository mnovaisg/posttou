import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import {
  cancelSubscription,
  changePlan,
  COUPON_REASON_LABEL,
  createWorkspaceInOrganization,
  fetchOrganizationWorkspaces,
  fetchPlans,
  fetchWorkspaceEntitlements,
  previewCoupon,
  startCheckout,
} from '@/features/billing/api'
import type { CouponPreview } from '@/features/billing/api'

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em teste grátis',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  cancel_at_period_end: 'Cancelamento agendado',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatWhole(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

export function BillingPage() {
  const { activeWorkspace, activeRole } = useWorkspace()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = React.useState('')
  const [cpfCnpj, setCpfCnpj] = React.useState('')
  const [couponOpenFor, setCouponOpenFor] = React.useState<string | null>(null)
  const [couponInput, setCouponInput] = React.useState<Record<string, string>>({})
  const [couponStatus, setCouponStatus] = React.useState<Record<string, 'validating' | 'done'>>({})
  const [couponResult, setCouponResult] = React.useState<Record<string, CouponPreview>>({})
  const [billingInterval, setBillingInterval] = React.useState<'monthly' | 'yearly'>('monthly')

  const organizationId = activeWorkspace?.organization_id ?? null
  const isOwner = activeRole === 'owner'

  const entitlementsQuery = useQuery({
    queryKey: ['billing-entitlements', activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: () => fetchWorkspaceEntitlements(activeWorkspace!.id),
  })

  const plansQuery = useQuery({ queryKey: ['billing-plans'], queryFn: fetchPlans })

  const workspacesQuery = useQuery({
    queryKey: ['billing-org-workspaces', organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchOrganizationWorkspaces(organizationId!),
  })

  const ent = entitlementsQuery.data

  async function handleAction(action: () => Promise<unknown>, key: string) {
    setError(null)
    setBusy(key)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] })
      await queryClient.invalidateQueries({ queryKey: ['billing-org-workspaces'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(null)
    }
  }

  async function handleApplyCoupon(planId: string) {
    const code = (couponInput[planId] ?? '').trim()
    if (!code || !organizationId) return
    setCouponStatus((s) => ({ ...s, [planId]: 'validating' }))
    try {
      const result = await previewCoupon(organizationId, code, planId, billingInterval)
      setCouponResult((r) => ({ ...r, [planId]: result }))
    } catch {
      setCouponResult((r) => ({ ...r, [planId]: { valid: false, reason: 'not_found' } }))
    } finally {
      setCouponStatus((s) => ({ ...s, [planId]: 'done' }))
    }
  }

  // Um cupom validado é específico do ciclo (mensal/anual) — trocar o
  // ciclo sem invalidar o resultado anterior poderia mostrar um desconto
  // que não é mais o que será de fato aplicado no checkout.
  function handleIntervalChange(next: 'monthly' | 'yearly') {
    setBillingInterval(next)
    setCouponResult({})
    setCouponStatus({})
  }

  if (!activeWorkspace || entitlementsQuery.isLoading) {
    return <div className="p-6 text-sm text-ink-500">Carregando plano...</div>
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Plano e cobrança</h1>
        <p className="mt-1 text-sm text-ink-500">Franquia de conteúdos, plano atual e assinatura.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {ent && (
        <div className="rounded-xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-500">Plano atual</p>
              <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">{ent.plan_name}</p>
            </div>
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-900 dark:bg-brand-950 dark:text-brand-200">
              {STATUS_LABEL[ent.status] ?? ent.status}
            </span>
          </div>

          {ent.content_remaining_this_period !== null ? (
            <div className="mt-4">
              <p className="text-sm text-ink-600 dark:text-ink-300">
                {ent.monthly_content_allowance - (ent.content_remaining_this_period ?? 0)} de {ent.monthly_content_allowance} conteúdos utilizados
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div
                  className="h-full bg-brand-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((ent.monthly_content_allowance - (ent.content_remaining_this_period ?? 0)) / Math.max(ent.monthly_content_allowance, 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-400">
                Renova em {new Date(ent.franchise_period_end).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-500">
              Durante o teste grátis, o limite é controlado por créditos internos, não pela franquia de conteúdos do plano.
            </p>
          )}

          {ent.trial_ends_at && ent.status === 'trialing' && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              Teste grátis até {new Date(ent.trial_ends_at).toLocaleDateString('pt-BR')} às{' '}
              {new Date(ent.trial_ends_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}

          {isOwner && (ent.status === 'active' || ent.status === 'past_due') && (
            <button
              className="mt-4 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              disabled={busy === 'cancel'}
              onClick={() => handleAction(() => cancelSubscription(organizationId!), 'cancel')}
            >
              Cancelar assinatura
            </button>
          )}
          {ent.status === 'cancel_at_period_end' && (
            <p className="mt-4 text-sm text-ink-500">
              Cancelamento agendado — acesso continua até {ent.franchise_period_end && new Date(ent.franchise_period_end).toLocaleDateString('pt-BR')}.
            </p>
          )}
        </div>
      )}

      {isOwner && ent && (ent.status === 'trialing' || ent.status === 'expired' || ent.status === 'cancelled') && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <label className="block text-sm font-medium text-ink-700 dark:text-ink-200" htmlFor="cpfCnpj">
            CPF ou CNPJ (necessário para gerar a cobrança)
          </label>
          <input
            id="cpfCnpj"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
            placeholder="Só números"
            value={cpfCnpj}
            onChange={(e) => setCpfCnpj(e.target.value)}
          />
        </div>
      )}

      {isOwner && plansQuery.data && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Planos disponíveis</h2>
            <div className="flex w-fit items-center gap-1 rounded-lg border border-ink-200 p-1 dark:border-ink-700">
              <button
                type="button"
                onClick={() => handleIntervalChange('monthly')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  billingInterval === 'monthly' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => handleIntervalChange('yearly')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  billingInterval === 'yearly' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'
                }`}
              >
                Anual · 2 meses grátis
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plansQuery.data.map((plan) => {
              const isCurrent = ent?.plan_id === plan.id
              // Apresentação apenas: no anual, mostramos o equivalente mensal
              // (valor anual oficial ÷ 12) — a cobrança real (startCheckout/
              // changePlan) sempre envia billingInterval e o servidor lê o
              // valor cheio direto de price_yearly_cents, nunca este número.
              const monthlyEquivalentCents = Math.round(plan.price_yearly_cents / 12)
              const yearlySavingsCents = plan.price_monthly_cents * 12 - plan.price_yearly_cents
              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-4 ${
                    isCurrent ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-200 dark:border-ink-800'
                  }`}
                >
                  <p className="font-semibold text-ink-900 dark:text-ink-50">{plan.name}</p>
                  {billingInterval === 'monthly' ? (
                    <p className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-50">
                      {formatCents(plan.price_monthly_cents)}
                      <span className="text-xs font-normal text-ink-500">/mês</span>
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-50">
                        {formatCents(monthlyEquivalentCents)}
                        <span className="text-xs font-normal text-ink-500">/mês</span>
                      </p>
                      <p className="text-xs text-ink-500">cobrado {formatWhole(plan.price_yearly_cents)} por ano</p>
                      {yearlySavingsCents > 0 && (
                        <p className="text-xs font-medium text-green-700 dark:text-green-400">Economize {formatWhole(yearlySavingsCents)}/ano</p>
                      )}
                    </>
                  )}
                  <ul className="mt-3 space-y-1 text-sm text-ink-600 dark:text-ink-300">
                    <li>{plan.monthly_content_allowance} conteúdos/mês</li>
                    <li>Até {plan.max_workspaces} marca{plan.max_workspaces > 1 ? 's' : ''}</li>
                    <li>Até {plan.max_members} usuário{plan.max_members > 1 ? 's' : ''}</li>
                  </ul>
                  {!isCurrent && (() => {
                    const needsCheckout = !ent?.status || ent.status === 'trialing' || ent.status === 'expired' || ent.status === 'cancelled'
                    const disabled = busy === `plan-${plan.id}` || (needsCheckout && !cpfCnpj.trim())
                    const applied = couponResult[plan.id]
                    const appliedCode = couponInput[plan.id]?.trim()
                    return (
                      <>
                        {needsCheckout && (
                          <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
                            {couponOpenFor !== plan.id && !applied?.valid && (
                              <button
                                type="button"
                                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                                onClick={() => setCouponOpenFor(plan.id)}
                              >
                                Tem um cupom?
                              </button>
                            )}
                            {(couponOpenFor === plan.id || applied?.valid) && (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex gap-1.5">
                                  <input
                                    className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2 py-1.5 text-xs uppercase dark:border-ink-800 dark:bg-ink-950"
                                    placeholder="DIGITE SEU CUPOM"
                                    value={couponInput[plan.id] ?? ''}
                                    disabled={!!applied?.valid}
                                    onChange={(e) => setCouponInput((s) => ({ ...s, [plan.id]: e.target.value }))}
                                  />
                                  {!applied?.valid && (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                                      disabled={couponStatus[plan.id] === 'validating' || !couponInput[plan.id]?.trim()}
                                      onClick={() => handleApplyCoupon(plan.id)}
                                    >
                                      {couponStatus[plan.id] === 'validating' ? 'Validando…' : 'Aplicar'}
                                    </button>
                                  )}
                                </div>
                                {applied && !applied.valid && (
                                  <p className="text-xs text-danger-500">{COUPON_REASON_LABEL[applied.reason ?? ''] ?? 'Cupom inválido.'}</p>
                                )}
                                {applied?.valid && (
                                  <div className="rounded-lg bg-green-50 p-2 text-xs text-green-900 dark:bg-green-950 dark:text-green-200">
                                    <p>
                                      Cupom {applied.code} − {formatCents(applied.discountAmountCents ?? 0)}
                                    </p>
                                    <p className="mt-0.5 font-semibold">Hoje: {formatCents(applied.finalAmountCents ?? 0)}</p>
                                    {applied.duration === 'first_payment' ? (
                                      <p className="mt-0.5 text-green-700 dark:text-green-400">
                                        {billingInterval === 'monthly'
                                          ? `Próxima renovação: ${formatCents(plan.price_monthly_cents)}/mês`
                                          : `Próxima renovação: ${formatWhole(plan.price_yearly_cents)}/ano`}
                                      </p>
                                    ) : (
                                      <p className="mt-0.5 text-green-700 dark:text-green-400">Desconto aplicado enquanto o cupom estiver ativo.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          className="mt-4 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                          disabled={disabled}
                          onClick={() =>
                            handleAction(async () => {
                              if (needsCheckout) {
                                const result = await startCheckout(
                                  organizationId!,
                                  plan.id,
                                  billingInterval,
                                  cpfCnpj,
                                  applied?.valid ? appliedCode : undefined,
                                )
                                if (result.invoiceUrl) window.open(result.invoiceUrl, '_blank')
                              } else {
                                const result = await changePlan(organizationId!, plan.id, billingInterval)
                                if (result.invoiceUrl) window.open(result.invoiceUrl, '_blank')
                              }
                            }, `plan-${plan.id}`)
                          }
                        >
                          {needsCheckout ? 'Assinar' : 'Trocar para este plano'}
                        </button>
                      </>
                    )
                  })()}
                  {isCurrent && <p className="mt-4 text-center text-sm text-brand-600 dark:text-brand-400">Plano atual</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isOwner && ent?.plan_id === 'agencia' && workspacesQuery.data && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Marcas desta assinatura</h2>
          <ul className="mb-3 space-y-1 text-sm text-ink-600 dark:text-ink-300">
            {workspacesQuery.data.map((w) => (
              <li key={w.id}>{w.name}</li>
            ))}
          </ul>
          {workspacesQuery.data.length < (ent.max_workspaces ?? 1) && (
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
                placeholder="Nome da nova marca"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
              <button
                className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={!newWorkspaceName.trim() || busy === 'create-workspace'}
                onClick={() =>
                  handleAction(async () => {
                    await createWorkspaceInOrganization(organizationId!, newWorkspaceName.trim())
                    setNewWorkspaceName('')
                  }, 'create-workspace')
                }
              >
                Adicionar marca
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
