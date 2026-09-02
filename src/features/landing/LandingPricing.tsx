import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPlans } from '@/features/billing/api'
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

  React.useEffect(() => {
    if (plansQuery.data) {
      trackEvent('landing_pricing_viewed')
      trackEvent('pricing_viewed')
    }
  }, [plansQuery.data])

  return (
    <section id="planos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">Planos</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">3 dias grátis em qualquer plano — sem cartão de crédito.</p>
      </div>

      <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-lg border border-ink-200 p-1 dark:border-ink-700">
        <button
          type="button"
          onClick={() => setInterval('monthly')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === 'monthly' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'
          }`}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => setInterval('yearly')}
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
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-6 ${
                  highlighted
                    ? 'border-brand-500 bg-white shadow-lg ring-1 ring-brand-500 dark:bg-ink-900'
                    : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900'
                }`}
              >
                {highlighted && (
                  <Badge variant="brand" className="mb-3 w-fit">
                    Mais escolhido
                  </Badge>
                )}
                <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{plan.name}</h3>

                {interval === 'monthly' ? (
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

                <Button
                  className="mt-6"
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
