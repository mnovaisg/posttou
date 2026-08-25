// Fatos sustentáveis do produto em beta — sem números inventados de
// usuários/marcas/conteúdos. Estrutura em array para trocar facilmente
// por métricas reais medidas quando existirem.
const INDICATORS = [
  { value: '~5 min', label: 'para começar' },
  { value: '3 dias', label: 'grátis para testar' },
  { value: 'Texto + Arte', label: 'criados com IA' },
  { value: 'Piloto Automático', label: 'cria conforme seu planejamento' },
]

export function LandingIndicators() {
  return (
    <section className="border-y border-ink-100 bg-ink-50/60 py-10 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 sm:px-6 lg:grid-cols-4">
        {INDICATORS.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-2xl font-bold text-ink-900 dark:text-ink-50 sm:text-3xl">{item.value}</p>
            <p className="mt-1 text-sm text-ink-500">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
