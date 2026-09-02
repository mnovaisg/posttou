const AUDIENCES = [
  'Clínicas',
  'Advocacia',
  'Restaurantes',
  'Imobiliárias',
  'Igrejas',
  'Profissionais autônomos',
  'Criadores',
  'Pequenas empresas',
  'Agências',
]

export function LandingAudience() {
  return (
    <section className="border-y border-ink-100 bg-ink-50 py-16 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Feito para quem precisa postar, mas não vive de criar posts.
          </h2>
        </div>
        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-3">
          {AUDIENCES.map((a) => (
            <span
              key={a}
              className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
            >
              {a}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
