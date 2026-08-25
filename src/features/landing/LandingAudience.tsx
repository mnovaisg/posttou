const AUDIENCES = [
  { title: 'Negócios', description: 'Para quem precisa manter presença digital sem montar uma equipe inteira de conteúdo.' },
  { title: 'Social medias', description: 'Para produzir e gerenciar conteúdo com mais eficiência.' },
  { title: 'Agências', description: 'Para gerenciar várias marcas e equipes em um só lugar.' },
]

export function LandingAudience() {
  return (
    <section className="border-y border-ink-100 bg-ink-50 py-16 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-semibold text-ink-900 dark:text-ink-50">Para quem é o POSTTOU</h2>
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-700 dark:bg-ink-900">
              <h3 className="font-semibold text-ink-900 dark:text-ink-50">{a.title}</h3>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
