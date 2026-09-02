import { DnaMockup, CreateMockup, PilotMockup } from '@/features/landing/mockups'

const BENEFITS = ['Menos tempo pensando.', 'Mais consistência.', 'Mais identidade.', 'Mais organização.', 'Decisões melhores.']

const STEPS = [
  {
    n: '01',
    title: 'Mostre sua marca',
    description: 'Comece pelo seu @ e complete o DNA da sua empresa.',
  },
  {
    n: '02',
    title: 'Receba sua estratégia',
    description: 'O POSTTOU entende seu posicionamento, público, comunicação e estilo visual para transformar isso em conteúdo.',
  },
  {
    n: '03',
    title: 'Deixe o POSTTOU trabalhar',
    description: 'Crie, planeje, acompanhe oportunidades e configure o Piloto Automático.',
  },
]

const STEP_MOCKUPS = [DnaMockup, CreateMockup, PilotMockup]

export function LandingBenefits() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
        {BENEFITS.map((b) => (
          <p key={b} className="text-lg font-medium text-ink-800 dark:text-ink-100">
            {b}
          </p>
        ))}
      </div>
    </section>
  )
}

export function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="border-y border-ink-100 bg-ink-50 py-16 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Como funciona</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Do seu negócio ao primeiro conteúdo em poucos minutos.
          </h2>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Mockup = STEP_MOCKUPS[i]
            return (
              <div key={s.n} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{s.n}</span>
                <h3 className="mt-1 font-semibold text-ink-900 dark:text-ink-50">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{s.description}</p>
                <div className="mt-5 w-full max-w-xs" aria-hidden="true">
                  <Mockup />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
