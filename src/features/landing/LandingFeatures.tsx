import type * as React from 'react'
import { DnaMockup, RadarMockup, PilotMockup, PerformanceMockup } from '@/features/landing/mockups'
import { LandingContentCarousel } from '@/features/landing/LandingContentCarousel'

function FeatureRow({
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse,
}: {
  eyebrow: string
  title: string
  description: string
  points: string[]
  visual: React.ReactNode
  reverse?: boolean
}) {
  return (
    <div className={`grid grid-cols-1 items-center gap-8 py-12 sm:grid-cols-2 sm:gap-12 ${reverse ? 'sm:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
        <p className="mt-3 text-ink-600 dark:text-ink-300">{description}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
              <span className="mt-0.5 text-brand-600 dark:text-brand-400">✓</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto w-full max-w-sm">{visual}</div>
    </div>
  )
}

export function LandingFeatures() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-ink-900 dark:text-ink-50">Tudo que seu conteúdo precisa. Em um só lugar.</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          O POSTTOU aprende quem é a sua marca antes de criar qualquer conteúdo por ela.
        </p>
      </div>

      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        <FeatureRow
          eyebrow="DNA da Marca"
          title="Uma IA que aprende sua marca antes de criar por ela"
          description="O POSTTOU aprende como sua empresa fala, para quem fala e como deve parecer — posicionamento, público, tom de voz, cores e estilo visual."
          points={['Estilo de comunicação e tom de voz', 'Cores e estilo visual (fotográfico, ilustração ou 3D)', 'Biblioteca da Marca com seus próprios materiais']}
          visual={<DnaMockup />}
        />

        <FeatureRow
          eyebrow="Criação com IA"
          title="Da ideia ao conteúdo, sem começar de uma tela em branco"
          description="Não é um chatbot solto: cada conteúdo já nasce com ideia, título, legenda, CTA, hashtags, formato e arte — seguindo o DNA da sua marca."
          points={['Ideia, hook e legenda prontos', 'Formato e arte já pensados juntos', 'Você edita tudo no Editor antes de publicar']}
          visual={<LandingContentCarousel />}
          reverse
        />

        <FeatureRow
          eyebrow="Radar Viral"
          title="Pare de procurar assunto. Deixe as oportunidades chegarem até você"
          description="Configure os assuntos, hashtags e perfis que fazem sentido para o seu mercado — o Radar cruza sinais reais com o DNA da sua marca para sugerir ângulos."
          points={['Termos do nicho e hashtags configuráveis', 'Concorrentes que você quer acompanhar', 'Oportunidades cruzadas com o DNA da marca']}
          visual={<RadarMockup />}
        />

        <FeatureRow
          eyebrow="Piloto Automático"
          title="Seu conteúdo não precisa depender da sua memória"
          description="Configure sua rotina — dias, horários e diretrizes — e deixe o POSTTOU preparar seus conteúdos automaticamente. Você decide se quer revisar antes de publicar."
          points={['Agenda semanal com diretriz por horário', 'Usa o Radar quando fizer sentido', 'Sempre pausável, sempre sob seu controle']}
          visual={<PilotMockup />}
          reverse
        />

        <FeatureRow
          eyebrow="Desempenho"
          title="O POSTTOU também aprende com o que acontece depois que você posta"
          description="Acompanhe os dados reais disponíveis sobre suas publicações — o desempenho ajuda a orientar os próximos conteúdos."
          points={['Aprendizados a partir do que já foi publicado', 'Recomendações de estratégia aplicáveis', 'Sempre com sua aprovação antes de aplicar']}
          visual={<PerformanceMockup />}
        />
      </div>
    </section>
  )
}
