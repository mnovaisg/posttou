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
    description: 'Hoje, por uma descrição curta. Em breve, direto pelo seu @Instagram.',
  },
  {
    n: '2',
    title: 'Sua marca ganha conteúdo',
    description: 'O POSTTOU usa o DNA da Marca e o DNA Visual para criar texto e arte.',
  },
  {
    n: '3',
    title: 'Você decide o nível de automação',
    description: 'Revise e publique você mesmo, ou configure o Piloto Automático.',
  },
]

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
          <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">Como funciona</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Do seu negócio ao primeiro conteúdo em poucos minutos.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center sm:text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white sm:h-9 sm:w-9">
                {s.n}
              </span>
              <h3 className="mt-3 font-semibold text-ink-900 dark:text-ink-50">{s.title}</h3>
              <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
