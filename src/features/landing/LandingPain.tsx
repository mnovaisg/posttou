const PAINS = [
  'Não sei o que postar.',
  'Não tenho tempo para criar.',
  'Meu feed não tem padrão.',
  'Posto quando consigo.',
  'Não sei o que está funcionando.',
  'Não consigo acompanhar o meu mercado.',
]

export function LandingPain() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
      <h2 className="text-2xl font-semibold text-ink-900 dark:text-ink-50 sm:text-3xl">
        Seu Instagram depende de você lembrar de tudo?
      </h2>

      <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {PAINS.map((pain) => (
          <div
            key={pain}
            className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-left text-sm text-ink-600 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-300"
          >
            "{pain}"
          </div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-lg text-lg font-medium text-ink-900 dark:text-ink-50">
        O problema não é falta de conteúdo. <br className="hidden sm:block" />É falta de um sistema.
      </p>
    </section>
  )
}
