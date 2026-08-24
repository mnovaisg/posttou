import * as React from 'react'
import { captureException } from '@/lib/observability'
import { getSupportEmail } from '@/lib/support'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack })
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      const supportEmail = getSupportEmail()
      return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
          <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
            <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-50">Algo deu errado</h1>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              Tivemos um problema inesperado ao carregar esta tela. Seus dados estão seguros.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                onClick={this.handleReset}
              >
                Tentar novamente
              </button>
              <a
                href="/"
                className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                Voltar ao Dashboard
              </a>
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}?subject=Erro no POSTTOU`}
                  className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
                >
                  Procurar suporte
                </a>
              ) : (
                import.meta.env.DEV && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Suporte não configurado (VITE_SUPPORT_EMAIL ausente) — visível só em desenvolvimento.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
