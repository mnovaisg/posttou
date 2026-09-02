import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trackEvent } from '@/lib/analytics'
import { normalizeInstagramHandle } from '@/lib/pendingInstagramHandle'
import { LandingContentCarousel } from '@/features/landing/LandingContentCarousel'

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
    trackEvent('landing_cta_start_free_click', { placement: 'hero', hasHandle: true })
    // Religa direto na infraestrutura real de Discovery (mesma usada por
    // /descobrir) — a landing não roda nenhuma análise por conta própria,
    // só encaminha o @ já normalizado para lá.
    navigate(`/descobrir?handle=${encodeURIComponent(normalized)}`)
  }

  return (
    <section id="topo" className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <p className="text-sm font-semibold tracking-wide text-brand-600 dark:text-brand-400 sm:text-base">
            Pensou. Criou. POSTTOU.
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            Seu próximo <span className="brand-gradient-text">conteúdo</span> começa pelo seu Instagram.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600 dark:text-ink-300 lg:mx-0">
            Digite seu @ e descubra como o POSTTOU entende sua marca e transforma isso em conteúdo.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col items-center gap-3 lg:items-start">
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
                Analisar meu perfil
              </Button>
            </div>
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <p className="text-sm text-ink-500">Experimente grátis. Sem cartão de crédito.</p>
          </form>
        </div>

        <LandingContentCarousel />
      </div>
    </section>
  )
}
