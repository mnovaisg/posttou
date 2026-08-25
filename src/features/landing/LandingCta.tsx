import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

export function LandingCta() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
      <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50 sm:text-4xl">
        E aí, já POSTTOU hoje?
      </h2>
      <p className="mt-3 text-lg text-ink-600 dark:text-ink-300">
        Comece grátis e deixe o POSTTOU conhecer sua marca.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" asChild onClick={() => trackEvent('landing_cta_start_free_click', { placement: 'final' })}>
          <Link to="/cadastro">Testar grátis</Link>
        </Button>
        <p className="text-sm text-ink-500">3 dias grátis · Sem cartão</p>
      </div>
    </section>
  )
}
