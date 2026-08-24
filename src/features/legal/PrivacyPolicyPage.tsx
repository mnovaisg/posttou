import { Link } from 'react-router-dom'

export function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl p-6 text-sm text-ink-700 dark:text-ink-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <strong>Aviso:</strong> este é um texto provisório, gerado para viabilizar o lançamento técnico do produto.
        Ainda não foi revisado por um advogado e não deve ser tratado como documento jurídico definitivo.
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-ink-900 dark:text-ink-50">Política de Privacidade</h1>
      <p className="mb-6 text-xs text-ink-400">Versão 2026.08-provisorio</p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">1. Quem somos</h2>
      <p>O POSTTOU é um SaaS de gestão e criação de conteúdo para Instagram.</p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">2. Dados que coletamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cadastro: nome e e-mail.</li>
        <li>Cobrança: CPF/CNPJ (transmitido diretamente ao nosso processador de pagamentos, Asaas — não armazenamos esse dado em nossos próprios servidores).</li>
        <li>Organização/marca: nome da empresa, marcas cadastradas, membros da equipe.</li>
        <li>Integração com Instagram: nome de usuário, foto e token de acesso da conta conectada.</li>
        <li>Conteúdo criado por você: textos, imagens e referências salvas na plataforma.</li>
        <li>Registros de uso e auditoria: ações realizadas na plataforma, para segurança e suporte.</li>
        <li>Dados de assinatura: plano, status de pagamento, histórico de cobrança (processados pelo Asaas).</li>
      </ul>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">3. Como usamos seus dados</h2>
      <p>Para operar o produto, processar pagamentos, dar suporte, e cumprir obrigações legais.</p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">4. Compartilhamento</h2>
      <p>Compartilhamos dados com processadores necessários à operação: Supabase (infraestrutura), Asaas (pagamentos), Meta/Instagram (publicação), Kie.ai (geração por IA).</p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">5. Seus direitos (LGPD)</h2>
      <p>
        Você pode solicitar a exportação dos seus dados e a exclusão da sua conta a qualquer momento em{' '}
        <Link to="/configuracoes" className="font-medium text-brand-600 hover:underline">
          Configurações → Privacidade
        </Link>
        .
      </p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">6. Retenção</h2>
      <p>Registros financeiros e de auditoria são preservados mesmo após exclusão de conta, conforme obrigação legal de guarda. Conteúdo de workspaces compartilhados é preservado para os demais membros.</p>

      <h2 className="mt-6 mb-2 text-base font-semibold text-ink-900 dark:text-ink-50">7. Contato</h2>
      <p>Dúvidas sobre privacidade: use o canal de suporte em Configurações.</p>
    </div>
  )
}
