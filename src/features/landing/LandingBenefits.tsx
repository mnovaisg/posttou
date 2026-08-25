import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const BENEFITS = [
  {
    title: 'Nunca mais fique sem saber o que postar',
    description: 'O POSTTOU entende sua marca e transforma estratégia em ideias e conteúdos prontos.',
  },
  {
    title: 'Texto e arte, juntos',
    description: 'Conteúdos completos seguindo o posicionamento e a identidade da sua marca — não só legenda.',
  },
  {
    title: 'Pare de correr atrás do calendário',
    description: 'Planeje, aprove ou deixe o Piloto Automático trabalhar por você.',
  },
  {
    title: 'Não poste no escuro',
    description: 'Acompanhe o desempenho e use os resultados para melhorar os próximos conteúdos.',
  },
  {
    title: 'Sua marca continua sendo sua',
    description: 'DNA da Marca + DNA Visual mantêm consistência, em vez de produzir conteúdo genérico.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'O POSTTOU conhece sua marca',
    description:
      'Informe seu Instagram ou descreva brevemente o negócio. O POSTTOU prepara uma primeira versão do DNA da marca para revisão.',
  },
  {
    n: '2',
    title: 'Seu primeiro conteúdo ganha vida',
    description: 'O POSTTOU cria texto + arte usando o DNA da Marca e, quando configurado, o DNA Visual.',
  },
  {
    n: '3',
    title: 'Você publica ou liga o Piloto',
    description: 'Revise, agende/publique ou ative o Piloto Automático.',
  },
]

// Ilustrações da jornada real do POSTTOU, construídas com os próprios
// componentes de UI do produto (Badge/Button/tokens de marca) — não são
// screenshots, e nenhum layout/identidade de terceiros foi usado.
function StepMockupKnowBrand() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs font-semibold text-ink-400">Vamos conhecer sua marca</p>
      <div className="mt-3 flex gap-2">
        <div className="flex h-9 flex-1 items-center rounded-lg border border-ink-200 px-3 text-sm text-ink-400 dark:border-ink-700">
          @seuinstagram
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          →
        </span>
      </div>
      <Badge variant="brand" className="mt-4">
        DNA da marca em revisão
      </Badge>
    </div>
  )
}

function StepMockupContent() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex gap-3">
        <div
          className="h-16 w-16 shrink-0 rounded-lg"
          style={{ background: 'linear-gradient(135deg, #6748fa 0%, #c026d3 100%)' }}
        />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-2.5 w-full rounded-full bg-ink-100 dark:bg-ink-800" />
          <div className="h-2.5 w-4/5 rounded-full bg-ink-100 dark:bg-ink-800" />
          <div className="h-2.5 w-3/5 rounded-full bg-ink-100 dark:bg-ink-800" />
        </div>
      </div>
      <Badge className="mt-4">Texto + arte gerados</Badge>
    </div>
  )
}

function StepMockupPublish() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 dark:border-ink-800">
        <span className="text-sm font-medium text-ink-800 dark:text-ink-100">Piloto Automático</span>
        <span className="flex h-5 w-9 items-center rounded-full bg-brand-600 p-0.5">
          <span className="h-4 w-4 translate-x-4 rounded-full bg-white" />
        </span>
      </div>
      <Button size="sm" variant="outline" className="mt-3 w-full" type="button" tabIndex={-1}>
        Publicar agora
      </Button>
    </div>
  )
}

const STEP_MOCKUPS = [StepMockupKnowBrand, StepMockupContent, StepMockupPublish]

export function LandingBenefits() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">
          Mais do que um gerador de posts com IA
        </h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          O POSTTOU conhece sua marca, cria conteúdo e arte, permite revisão, publica, automatiza e aprende com os
          resultados.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-xl border border-ink-100 p-5 dark:border-ink-800">
            <h3 className="font-semibold text-ink-900 dark:text-ink-50">{b.title}</h3>
            <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{b.description}</p>
          </div>
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
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Como funciona
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Do seu negócio ao primeiro conteúdo em poucos minutos.
          </h2>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Mockup = STEP_MOCKUPS[i]
            return (
              <div key={s.n} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {s.n}
                </span>
                <h3 className="mt-3 font-semibold text-ink-900 dark:text-ink-50">{s.title}</h3>
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
