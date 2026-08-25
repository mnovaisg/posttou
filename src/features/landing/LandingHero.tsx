import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trackEvent } from '@/lib/analytics'
import { normalizeInstagramHandle, setPendingInstagramHandle } from '@/lib/pendingInstagramHandle'

const DEMO_STEPS = [
  'POSTTOU conheceu sua marca',
  'DNA da Marca criado',
  'Conteúdo criado',
  'Arte criada',
  'Pronto para publicar',
  'Performance analisada',
]

export function LandingHero() {
  const navigate = useNavigate()
  const [handleInput, setHandleInput] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = handleInput.trim()
    if (!raw) {
      trackEvent('landing_cta_start_free_click', { placement: 'hero' })
      navigate('/cadastro')
      return
    }
    const normalized = normalizeInstagramHandle(raw)
    if (!normalized) {
      setError('Não reconhecemos esse @. Confira e tente de novo.')
      return
    }
    setError(null)
    setPendingInstagramHandle(normalized)
    trackEvent('landing_cta_start_free_click', { placement: 'hero', hasHandle: true })
    navigate('/cadastro')
  }

  return (
    <section id="topo" className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-600 dark:text-brand-400 sm:text-base">
          Pensou. Criou. POSTTOU.
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
          Seu Instagram no piloto automático.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600 dark:text-ink-300">
          O POSTTOU conhece sua marca, cria conteúdos com texto + arte, publica e aprende com os resultados.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col items-center gap-3">
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <Input
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="@seuinstagram"
              aria-label="Seu Instagram"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="sm:flex-1"
            />
            <Button type="submit" size="lg">
              Testar grátis
            </Button>
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <p className="text-sm text-ink-500">3 dias grátis · Sem cartão</p>
        </form>
      </div>

      <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-8">
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-wide text-ink-400">
          O que acontece dentro do POSTTOU
        </p>
        <ol className="flex flex-col gap-3">
          {DEMO_STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
                ✓
              </span>
              <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{step}</span>
              {i < DEMO_STEPS.length - 1 && (
                <span className="ml-auto text-ink-300 dark:text-ink-600" aria-hidden>
                  ↓
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
