import * as React from 'react'

type Slide = {
  id: string
  kind: string
  caption: string
  gradient: string
}

// Demonstrações ilustrativas próprias do POSTTOU (nenhum asset/copy de
// terceiros) — estrutura pensada para ser trocada facilmente por
// conteúdos reais gerados por clientes quando existirem.
const SLIDES: Slide[] = [
  {
    id: 'educativo',
    kind: 'Educativo',
    caption: '5 dicas para vender mais no Instagram esta semana.',
    gradient: 'linear-gradient(135deg, #6748fa 0%, #8b5cf6 100%)',
  },
  {
    id: 'promocional',
    kind: 'Promocional',
    caption: 'Lançamento: conheça a nova coleção da marca.',
    gradient: 'linear-gradient(135deg, #c026d3 0%, #f97316 100%)',
  },
  {
    id: 'bastidores',
    kind: 'Bastidores',
    caption: 'Um dia por trás da produção do seu conteúdo.',
    gradient: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
  },
  {
    id: 'carrossel',
    kind: 'Carrossel',
    caption: 'Guia rápido: como aproveitar o produto em 3 passos.',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)',
  },
]

const AUTOPLAY_MS = 4500

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function LandingContentCarousel() {
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const reducedMotion = usePrefersReducedMotion()

  React.useEffect(() => {
    if (paused || reducedMotion) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [paused, reducedMotion])

  const slide = SLIDES[index]

  return (
    <div
      className="mx-auto w-full max-w-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-lg dark:border-ink-800 dark:bg-ink-900">
        <div
          className="flex h-2/3 items-center justify-center p-6 text-center transition-[background] duration-500"
          style={{ background: slide.gradient }}
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-white/90">{slide.kind}</span>
        </div>
        <div className="flex h-1/3 flex-col justify-center gap-1 px-5">
          <p className="line-clamp-2 text-sm font-medium text-ink-800 dark:text-ink-100">{slide.caption}</p>
        </div>

        <button
          type="button"
          aria-label="Exemplo anterior"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          className="absolute left-2 top-[33%] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink-700 shadow hover:bg-white dark:bg-ink-950/70 dark:text-ink-100"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Próximo exemplo"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          className="absolute right-2 top-[33%] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink-700 shadow hover:bg-white dark:bg-ink-950/70 dark:text-ink-100"
        >
          ›
        </button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Ver exemplo ${i + 1}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-6 bg-brand-600' : 'w-2 bg-ink-200 dark:bg-ink-700'
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink-400">Exemplo de conteúdo criado com o POSTTOU</p>
    </div>
  )
}
