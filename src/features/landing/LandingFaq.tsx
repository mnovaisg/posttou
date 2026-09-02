const FAQ_ITEMS = [
  {
    q: 'Preciso fornecer minha senha do Instagram?',
    a: 'Não. A conexão com o Instagram, quando utilizada, ocorre pelo fluxo oficial da Meta — o POSTTOU nunca pede nem armazena sua senha.',
  },
  {
    q: 'Preciso conectar meu Instagram para começar?',
    a: 'Não. Você começa só com seu @: o POSTTOU analisa o que está publicamente disponível e já prepara o DNA da sua marca. Conectar sua conta pelo login oficial da Meta é necessário depois, quando quiser agendar ou publicar direto pela plataforma.',
  },
  {
    q: 'O POSTTOU publica sozinho?',
    a: 'Por padrão, não. Todo conteúdo criado — inclusive o que o Piloto Automático prepara — fica em revisão antes de ir ao ar. Você sempre decide o que e quando publicar.',
  },
  {
    q: 'Posso revisar o conteúdo antes de publicar?',
    a: 'Sim, sempre. Texto e arte podem ser editados livremente antes de ir ao ar.',
  },
  {
    q: 'O POSTTOU aprende o estilo da minha marca?',
    a: 'Sim. O DNA da Marca guarda como sua empresa fala, para quem fala e como deve parecer — comunicação, cores e estilo visual (fotográfico, ilustração ou 3D) — e é usado em toda criação.',
  },
  {
    q: 'Posso usar minhas próprias fotos?',
    a: 'Sim. Na Biblioteca da Marca você envia fotos, produtos, pessoas e ambientes reais do seu negócio para reaproveitar nos conteúdos.',
  },
  {
    q: 'O que são créditos?',
    a: 'Cada geração de texto ou imagem por IA consome créditos do seu plano. O saldo fica visível no produto e cada geração é debitada uma única vez, mesmo em caso de nova tentativa.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim, direto nas configurações da sua conta, a qualquer momento.',
  },
  {
    q: 'Preciso saber usar IA?',
    a: 'Não. Você só precisa contar sobre sua marca — o POSTTOU conduz o resto, e você sempre revisa antes de publicar.',
  },
]

export function LandingFaq() {
  return (
    <section id="faq" className="border-y border-ink-100 bg-ink-50 py-16 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-semibold text-ink-900 dark:text-ink-50">Perguntas frequentes</h2>

        <div className="mt-10 flex flex-col divide-y divide-ink-200 dark:divide-ink-800">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-900 dark:text-ink-50">
                {item.q}
                <span className="shrink-0 text-ink-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
