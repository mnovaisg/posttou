import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPlans, fetchFeaturedCoupon, publicPreviewCoupon, COUPON_REASON_LABEL } from '@/features/billing/api'
import type { CouponPreview } from '@/features/billing/api'
import { savePendingCoupon } from '@/lib/pendingCoupon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { trackEvent } from '@/lib/analytics'

// Formatação de apresentação — nunca usada como valor efetivamente
// cobrado. O checkout (BillingPage/startCheckout) sempre lê
// price_monthly_cents/price_yearly_cents direto do banco, nunca este
// equivalente mensal calculado aqui só para exibição.
function formatWhole(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}
function formatPrecise(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const HIGHLIGHTED_PLAN_ID = 'profissional'

export function LandingPricing() {
  const [interval, setInterval] = React.useState<'monthly' | 'yearly'>('monthly')
  const plansQuery = useQuery({ queryKey: ['landing-plans'], queryFn: fetchPlans })

  // Ajuste cupom na Landing — reaproveita a mesma infraestrutura de
  // validação do Billing (public_preview_coupon é a mesma lógica de
  // preview_coupon, só sem exigir organização, que ainda não existe
  // pré-cadastro). Nunca reserva/consome o cupom aqui: é só prévia,
  // igual ao Billing — a aplicação de verdade acontece no checkout.
  const [couponOpenFor, setCouponOpenFor] = React.useState<string | null>(null)
  const [couponInput, setCouponInput] = React.useState<Record<string, string>>({})
  const [couponStatus, setCouponStatus] = React.useState<Record<string, 'validating' | 'done'>>({})
  const [couponResult, setCouponResult] = React.useState<Record<string, CouponPreview>>({})

  // Selo promocional — dados reais do cupom marcado como "destacar na
  // Landing" pelo admin. Nunca hardcoda desconto/preço: o rótulo/código vem
  // do RPC público (public_featured_coupon_system), e o valor do desconto
  // por card vem do mesmo public_preview_coupon usado no fluxo manual de
  // "Tem um cupom?" — a mesma autoridade de cálculo, só disparada
  // automaticamente para os cards elegíveis.
  const featuredCouponQuery = useQuery({ queryKey: ['landing-featured-coupon'], queryFn: fetchFeaturedCoupon })
  const featuredCoupon = featuredCouponQuery.data ?? null
  const [featuredPreview, setFeaturedPreview] = React.useState<Record<string, CouponPreview>>({})

  function isFeaturedEligible(planId: string, forInterval: 'monthly' | 'yearly') {
    if (!featuredCoupon) return false
    const planOk = !featuredCoupon.eligible_plan_ids || featuredCoupon.eligible_plan_ids.length === 0 || featuredCoupon.eligible_plan_ids.includes(planId)
    const intervalOk =
      !featuredCoupon.eligible_billing_intervals ||
      featuredCoupon.eligible_billing_intervals.length === 0 ||
      featuredCoupon.eligible_billing_intervals.includes(forInterval)
    return planOk && intervalOk
  }

  React.useEffect(() => {
    if (!featuredCoupon || !plansQuery.data) return
    plansQuery.data.forEach((plan) => {
      if (!isFeaturedEligible(plan.id, interval)) return
      publicPreviewCoupon(featuredCoupon.code, plan.id, interval)
        .then((result) => setFeaturedPreview((s) => ({ ...s, [plan.id]: result })))
        .catch(() => setFeaturedPreview((s) => ({ ...s, [plan.id]: { valid: false, reason: 'not_found' } })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredCoupon, plansQuery.data, interval])

  React.useEffect(() => {
    if (plansQuery.data) {
      trackEvent('landing_pricing_viewed')
      trackEvent('pricing_viewed')
    }
  }, [plansQuery.data])

  async function runCouponPreview(planId: string, code: string, forInterval: 'monthly' | 'yearly') {
    setCouponStatus((s) => ({ ...s, [planId]: 'validating' }))
    try {
      const result = await publicPreviewCoupon(code, planId, forInterval)
      setCouponResult((r) => ({ ...r, [planId]: result }))
      if (result.valid) {
        // Só transporte do código até o cadastro/Billing — nunca
        // autoridade sobre desconto. Revalidado de verdade lá.
        savePendingCoupon({ code, planId, billingInterval: forInterval })
      }
    } catch {
      setCouponResult((r) => ({ ...r, [planId]: { valid: false, reason: 'not_found' } }))
    } finally {
      setCouponStatus((s) => ({ ...s, [planId]: 'done' }))
    }
  }

  function handleApplyCoupon(planId: string) {
    const code = (couponInput[planId] ?? '').trim()
    if (!code) return
    void runCouponPreview(planId, code, interval)
  }

  // Clicar no código do selo promocional preenche e aplica o cupom no
  // campo "Tem um cupom?" daquele card, passando pelo mesmo pipeline de
  // validação/preservação — nunca um atalho paralelo.
  function handleUseFeaturedCoupon(planId: string, code: string) {
    setCouponOpenFor(planId)
    setCouponInput((s) => ({ ...s, [planId]: code }))
    void runCouponPreview(planId, code, interval)
  }

  // Um cupom validado é específico do ciclo — trocar mensal/anual pode
  // mudar a elegibilidade (interval_not_eligible), então revalida
  // qualquer cupom já digitado/aplicado em vez de só descartar o
  // resultado anterior.
  function handleIntervalChange(next: 'monthly' | 'yearly') {
    setInterval(next)
    Object.entries(couponInput).forEach(([planId, code]) => {
      const trimmed = code?.trim()
      if (trimmed && couponResult[planId]) {
        void runCouponPreview(planId, trimmed, next)
      }
    })
  }

  return (
    <section id="planos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">Planos</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">3 dias grátis em qualquer plano — sem cartão de crédito.</p>
      </div>

      <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-lg border border-ink-200 p-1 dark:border-ink-700">
        <button
          type="button"
          onClick={() => handleIntervalChange('monthly')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === 'monthly' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'
          }`}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => handleIntervalChange('yearly')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === 'yearly' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'
          }`}
        >
          Anual · 2 meses grátis
        </button>
      </div>

      {plansQuery.isLoading && <p className="mt-10 text-center text-sm text-ink-400">Carregando planos…</p>}
      {plansQuery.isError && <p className="mt-10 text-center text-sm text-danger-500">Não foi possível carregar os planos agora.</p>}

      {plansQuery.data && (
        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
          {plansQuery.data.map((plan) => {
            const highlighted = plan.id === HIGHLIGHTED_PLAN_ID
            const capabilities = (plan.capabilities ?? {}) as Record<string, unknown>
            // Apresentação apenas: no anual, mostramos o equivalente mensal
            // (valor anual oficial ÷ 12) — a cobrança real continua sendo
            // o valor anual cheio, lido direto de price_yearly_cents no
            // checkout (não tocado aqui).
            const monthlyEquivalentCents = Math.round(plan.price_yearly_cents / 12)
            const yearlySavingsCents = plan.price_monthly_cents * 12 - plan.price_yearly_cents

            // Selo só aparece se: cupom destacado existe, é elegível para
            // este plano/ciclo, a prévia real confirmou validade, e o
            // usuário não aplicou manualmente outro cupom neste card (pra
            // não mostrar duas mensagens de desconto conflitantes).
            const promo = featuredCoupon && isFeaturedEligible(plan.id, interval) ? featuredPreview[plan.id] : undefined
            // Some ativo se um cupom manual DIFERENTE do destacado foi
            // aplicado no card — aí o widget de baixo já mostra o desconto
            // real daquele outro cupom, sem duplicar mensagens.
            const manualOtherCouponApplied =
              couponResult[plan.id]?.valid && (couponInput[plan.id] ?? '').trim().toUpperCase() !== featuredCoupon?.code.toUpperCase()
            const promoActive = !!promo?.valid && !manualOtherCouponApplied
            const promoPercent =
              promoActive && promo?.discountType === 'percentage' ? Math.round((promo.discountAmountCents! / promo.originalAmountCents!) * 100) : null

            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-6 ${
                  highlighted
                    ? 'border-brand-500 bg-white shadow-lg ring-1 ring-brand-500 dark:bg-ink-900'
                    : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900'
                }`}
              >
                <div className="flex flex-wrap gap-2">
                  {highlighted && (
                    <Badge variant="brand" className="mb-3 w-fit">
                      Mais escolhido
                    </Badge>
                  )}
                  {promoActive && (
                    <Badge className="mb-3 w-fit border-transparent bg-green-600 text-white">
                      {promoPercent !== null ? `${promoPercent}% OFF` : `${formatPrecise(promo!.discountAmountCents ?? 0)} OFF`}
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{plan.name}</h3>

                {promoActive && interval === 'monthly' && (
                  <div className="mt-3">
                    <p>
                      <span className="text-sm text-ink-400 line-through">de {formatWhole(promo!.originalAmountCents ?? 0)}/mês</span>
                    </p>
                    <p>
                      <span className="text-3xl font-semibold text-green-700 dark:text-green-400">{formatPrecise(promo!.finalAmountCents ?? 0)}</span>
                      <span className="text-sm text-ink-500">{promo!.duration === 'first_payment' ? ' no primeiro mês' : '/mês'}</span>
                    </p>
                    {promo!.duration === 'first_payment' && (
                      <p className="mt-1 text-xs text-ink-500">a partir do próximo ciclo: {formatWhole(plan.price_monthly_cents)}/mês</p>
                    )}
                  </div>
                )}

                {promoActive && interval === 'yearly' && (
                  <div className="mt-3">
                    <p>
                      <span className="text-sm text-ink-400 line-through">de {formatWhole(promo!.originalAmountCents ?? 0)}/ano</span>
                    </p>
                    <p>
                      <span className="text-3xl font-semibold text-green-700 dark:text-green-400">{formatPrecise(promo!.finalAmountCents ?? 0)}</span>
                      <span className="text-sm text-ink-500">{promo!.duration === 'first_payment' ? ' no primeiro ano' : '/ano'}</span>
                    </p>
                    {promo!.duration === 'first_payment' && (
                      <p className="mt-1 text-xs text-ink-500">a partir do próximo ciclo: {formatWhole(plan.price_yearly_cents)}/ano</p>
                    )}
                  </div>
                )}

                {!promoActive &&
                  (interval === 'monthly' ? (
                    <p className="mt-3">
                      <span className="text-3xl font-semibold text-ink-900 dark:text-ink-50">{formatWhole(plan.price_monthly_cents)}</span>
                      <span className="text-sm text-ink-500">/mês</span>
                    </p>
                  ) : (
                    <>
                      <p className="mt-3">
                        <span className="text-3xl font-semibold text-ink-900 dark:text-ink-50">{formatPrecise(monthlyEquivalentCents)}</span>
                        <span className="text-sm text-ink-500">/mês</span>
                      </p>
                      <p className="mt-1 text-xs text-ink-500">cobrado {formatWhole(plan.price_yearly_cents)} por ano</p>
                      {yearlySavingsCents > 0 && (
                        <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                          Economize {formatWhole(yearlySavingsCents)}/ano
                        </p>
                      )}
                    </>
                  ))}

                {promoActive &&
                  !(couponResult[plan.id]?.valid && (couponInput[plan.id] ?? '').trim().toUpperCase() === featuredCoupon!.code.toUpperCase()) && (
                    <button
                      type="button"
                      className="mt-2 w-fit text-xs text-ink-500"
                      onClick={() => handleUseFeaturedCoupon(plan.id, featuredCoupon!.code)}
                    >
                      Use o cupom{' '}
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono font-semibold text-ink-900 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-50 dark:hover:bg-ink-700">
                        {featuredCoupon!.code}
                      </span>
                    </button>
                  )}

                <ul className="mt-5 flex flex-col gap-2 text-sm text-ink-600 dark:text-ink-300">
                  <li>{plan.monthly_content_allowance} conteúdos por mês</li>
                  <li>
                    {plan.max_workspaces} {plan.max_workspaces === 1 ? 'marca' : 'marcas'}
                  </li>
                  <li>
                    {plan.max_members} {plan.max_members === 1 ? 'usuário' : 'usuários'}
                  </li>
                  {capabilities.can_use_pilot === true && <li>Piloto Automático incluso</li>}
                  {capabilities.can_use_radar === true && <li>Radar Viral incluso</li>}
                </ul>

                {(() => {
                  const applied = couponResult[plan.id]
                  return (
                    <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
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
                                {couponStatus[plan.id] === 'validating' ? 'Aplicando…' : 'Aplicar'}
                              </button>
                            )}
                          </div>
                          {applied && !applied.valid && (
                            <p className="text-xs text-danger-500">{COUPON_REASON_LABEL[applied.reason ?? ''] ?? 'Cupom inválido.'}</p>
                          )}
                          {applied?.valid && (
                            <div className="rounded-lg bg-green-50 p-2 text-xs text-green-900 dark:bg-green-950 dark:text-green-200">
                              <p className="font-medium">✓ Cupom aplicado</p>
                              {applied.duration === 'first_payment' ? (
                                <p className="mt-0.5">
                                  {applied.discountType === 'percentage'
                                    ? `${Math.round((applied.discountAmountCents! / applied.originalAmountCents!) * 100)}% de desconto no primeiro pagamento.`
                                    : `${formatPrecise(applied.discountAmountCents ?? 0)} de desconto no primeiro pagamento.`}
                                </p>
                              ) : (
                                <p className="mt-0.5">
                                  {applied.discountType === 'percentage'
                                    ? `${Math.round((applied.discountAmountCents! / applied.originalAmountCents!) * 100)}% de desconto enquanto o cupom estiver válido para a recorrência.`
                                    : `${formatPrecise(applied.discountAmountCents ?? 0)} de desconto enquanto o cupom estiver válido para a recorrência.`}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                <Button
                  className="mt-4"
                  variant={highlighted ? 'primary' : 'outline'}
                  asChild
                  onClick={() => {
                    trackEvent('landing_plan_selected', { planId: plan.id, interval })
                    trackEvent('signup_cta_clicked', { placement: 'pricing', planId: plan.id })
                  }}
                >
                  <Link to="/cadastro">Começar grátis</Link>
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
