import * as React from 'react'

type Slide = {
  id: string
  kind: string
  image: string
  alt: string
}

// Artes reais do POSTTOU (com texto embutido na própria imagem) — ordem
// pensada para cobrir os principais perfis de cliente.
const SLIDES: Slide[] = [
  {
    id: 'clinica',
    kind: 'Clínica',
    image: '/images/carrossel/clinica.jpg',
    alt: 'Exemplo de conteúdo criado com o POSTTOU para uma clínica',
  },
  {
    id: 'advocacia',
    kind: 'Advocacia',
    image: '/images/carrossel/advocacia.jpg',
    alt: 'Exemplo de conteúdo criado com o POSTTOU para um escritório de advocacia',
  },
  {
    id: 'influencer',
    kind: 'Influencer',
    image: '/images/carrossel/influencer.jpg',
    alt: 'Exemplo de conteúdo criado com o POSTTOU para um influenciador',
  },
  {
    id: 'negocios',
    kind: 'Outros Negócios',
    image: '/images/carrossel/negocios.jpg',
    alt: 'Exemplo de conteúdo criado com o POSTTOU para outros negócios',
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

  return (
    <div
      className="mx-auto w-full max-w-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-lg dark:border-ink-800 dark:bg-ink-900">
        {SLIDES.map((s, i) => (
          <img
            key={s.id}
            src={s.image}
            alt={s.alt}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
              i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}

        <button
          type="button"
          aria-label="Exemplo anterior"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink-700 shadow hover:bg-white dark:bg-ink-950/70 dark:text-ink-100"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Próximo exemplo"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink-700 shadow hover:bg-white dark:bg-ink-950/70 dark:text-ink-100"
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
