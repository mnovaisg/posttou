function FeatureRow({
  eyebrow,
  title,
  description,
  points,
  reverse,
}: {
  eyebrow: string
  title: string
  description: string
  points: string[]
  reverse?: boolean
}) {
  return (
    <div className={`grid grid-cols-1 items-center gap-8 py-12 sm:grid-cols-2 sm:gap-12 ${reverse ? 'sm:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
        <p className="mt-3 text-ink-600 dark:text-ink-300">{description}</p>
      </div>
      <ul className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ink-50 p-6 dark:border-ink-800 dark:bg-ink-900/40">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
            <span className="mt-0.5 text-brand-600 dark:text-brand-400">✓</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LandingFeatures() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">IA que primeiro conhece sua marca</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          Antes de criar qualquer conteúdo, o POSTTOU aprende quem é a sua marca.
        </p>
      </div>

      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        <FeatureRow
          eyebrow="DNA da Marca"
          title="Uma IA que aprende sua marca antes de criar"
          description="O POSTTOU entende posicionamento, público, personalidade, tom de voz e temas — e usa isso em toda criação. São sugestões e inferências para você revisar, nunca fatos definitivos."
          points={['Posicionamento e público', 'Personalidade e tom de voz', 'Temas e pilares de conteúdo', 'Identidade e direção visual']}
        />

        <FeatureRow
          eyebrow="Conteúdo + Arte"
          title="Do briefing à arte pronta"
          description="O resultado não é só legenda: ideia, texto e arte seguem o mesmo DNA da marca, prontos para revisão."
          points={['Ideia → texto → arte', 'Segue o DNA da Marca e o DNA Visual', 'Você edita tudo antes de publicar']}
          reverse
        />

        <FeatureRow
          eyebrow="Piloto Automático"
          title="Automático quando você quiser. Sob seu controle quando precisar."
          description="Escolha o nível de automação: revisar cada conteúdo antes de publicar, ou deixar o Piloto planejar e gerar sozinho, sempre pausável."
          points={['Modo assistido: você revisa cada conteúdo', 'Modo semiautomático: o Piloto planeja e gera sozinho', 'Pausar a qualquer momento']}
        />

        <FeatureRow
          eyebrow="Radar Viral"
          title="Descubra sinais e oportunidades antes de decidir o próximo conteúdo"
          description="O Radar identifica temas em alta e cruza com o DNA da sua marca para sugerir ângulos relevantes — não é uma previsão de viralização."
          points={['Sinais de temas em alta', 'Cruzamento com o DNA da sua marca', 'Sugestão de ângulo, não garantia de resultado']}
          reverse
        />

        <FeatureRow
          eyebrow="Performance"
          title="Não basta publicar. É preciso aprender."
          description="O POSTTOU acompanha o desempenho das publicações e transforma isso em aprendizados e recomendações para as próximas decisões."
          points={['Aprendizados a partir do que já foi publicado', 'Recomendações de estratégia aplicáveis', 'Sempre com sua aprovação antes de aplicar']}
        />

        <FeatureRow
          eyebrow="Controle"
          title="O piloto é automático. O controle continua sendo seu."
          description="Automação nunca significa perder o controle da sua marca."
          points={['Revisar antes de publicar', 'Editar conteúdo e arte livremente', 'Pausar o Piloto Automático quando quiser']}
          reverse
        />
      </div>
    </section>
  )
}
