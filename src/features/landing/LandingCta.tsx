import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trackEvent } from '@/lib/analytics'
import { normalizeInstagramHandle } from '@/lib/pendingInstagramHandle'

export function LandingCta() {
  const navigate = useNavigate()
  const [handleInput, setHandleInput] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = handleInput.trim()
    if (!raw) {
      trackEvent('signup_cta_clicked', { placement: 'final_empty' })
      navigate('/cadastro')
      return
    }
    const normalized = normalizeInstagramHandle(raw)
    if (!normalized) {
      setError('Não reconhecemos esse @. Confira e tente de novo.')
      return
    }
    setError(null)
    trackEvent('instagram_analysis_started', { placement: 'final' })
    trackEvent('landing_cta_start_free_click', { placement: 'final', hasHandle: true })
    navigate(`/descobrir?handle=${encodeURIComponent(normalized)}`)
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
      <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50 sm:text-4xl">
        Você cuida do seu negócio. O POSTTOU ajuda a cuidar do conteúdo.
      </h2>

      <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row">
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
        <p className="text-sm text-ink-500">3 dias grátis • sem cartão</p>
      </form>

      <p className="mt-10 text-sm font-medium text-ink-400">Pensou. Criou. POSTTOU.</p>
    </section>
  )
}
