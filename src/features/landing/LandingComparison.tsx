const WITHOUT = ['Pensar', 'Procurar ideia', 'Escrever', 'Criar arte', 'Lembrar de postar', 'Repetir']
const WITH = ['Marca', 'Estratégia', 'Conteúdo', 'Rotina']

export function LandingComparison() {
  return (
    <section className="border-y border-ink-100 bg-ink-50 py-16 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-ink-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Sem POSTTOU</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
              {WITHOUT.map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  {step}
                  {i < WITHOUT.length - 1 && <span className="text-ink-300 dark:text-ink-600">→</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-300 bg-white p-6 dark:border-brand-700 dark:bg-ink-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Com POSTTOU</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900 dark:text-ink-50">
              {WITH.map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  {step}
                  {i < WITH.length - 1 && <span className="text-brand-400">→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
