const FAQ_ITEMS = [
  {
    q: 'O POSTTOU publica sozinho?',
    a: 'Só se você quiser. No modo assistido, você revisa e aprova cada conteúdo antes de publicar. No Piloto Automático (modo semiautomático), o POSTTOU planeja e gera sozinho — mas pode ser pausado a qualquer momento.',
  },
  {
    q: 'Posso revisar antes de publicar?',
    a: 'Sim, sempre. Todo conteúdo gerado pode ser revisado e editado — texto e arte — antes de ir ao ar.',
  },
  {
    q: 'Os conteúdos seguem a identidade da minha marca?',
    a: 'Sim. O POSTTOU usa o DNA da Marca (posicionamento, público, tom de voz, temas) e o DNA Visual para manter consistência, em vez de gerar conteúdo genérico.',
  },
  {
    q: 'Preciso saber marketing ou design?',
    a: 'Não. O POSTTOU conduz a criação a partir do que você conta sobre sua marca — você revisa e aprova, não precisa dominar marketing ou design.',
  },
  {
    q: 'Preciso informar a senha do meu Instagram?',
    a: 'Não. A conexão com o Instagram é feita pela autenticação oficial da Meta — o POSTTOU nunca pede nem armazena sua senha.',
  },
  {
    q: 'O teste grátis precisa de cartão?',
    a: 'Não. Você tem 3 dias grátis sem informar nenhum cartão de crédito.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim, o cancelamento pode ser feito a qualquer momento direto nas configurações da sua conta.',
  },
  {
    q: 'Quantas marcas posso gerenciar?',
    a: 'Depende do plano — cada plano tem um número de marcas (workspaces) incluído. Veja os detalhes na seção de Planos.',
  },
  {
    q: 'O que acontece quando meu trial termina?',
    a: 'Para continuar usando o POSTTOU, você escolhe um plano e assina. Nenhuma cobrança é feita automaticamente sem você confirmar um plano.',
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
