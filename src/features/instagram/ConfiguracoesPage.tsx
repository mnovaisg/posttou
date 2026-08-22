import { Link, useSearchParams } from 'react-router-dom'
import { ConnectInstagramCard } from '@/features/instagram/ConnectInstagramCard'

export function ConfiguracoesPage() {
  const [searchParams] = useSearchParams()
  const fromDiscovery = searchParams.get('discovery') === '1'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Configurações</h1>
        <p className="mt-1 text-sm text-ink-500">Conta, integrações e workspace.</p>
      </div>

      {fromDiscovery && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200">
          <p className="font-medium">Analisamos seu perfil e já montamos um DNA preliminar da sua marca.</p>
          <p className="mt-1">Conecte seu Instagram para continuar publicando por aqui, ou pule direto para revisar o DNA.</p>
          <Link to="/dna-da-marca" className="mt-2 inline-block font-medium underline">
            Pular para revisão do DNA
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Integrações</h2>
        <ConnectInstagramCard />
      </div>
    </div>
  )
}
