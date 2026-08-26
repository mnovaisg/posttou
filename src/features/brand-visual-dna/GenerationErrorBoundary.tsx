import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { captureException } from '@/lib/observability'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  onSkip: () => void
}

interface State {
  error: Error | null
}

// Error Boundary local à seção de geração de direções visuais — isola
// falhas dessa área específica (dado inesperado, exceção de render) sem
// derrubar o resto do app através do Error Boundary global. Nunca expõe
// task IDs, provider, Kie ou detalhes técnicos ao usuário.
class GenerationErrorBoundaryClass extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack, area: 'visual_dna_generation' })
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-700 dark:bg-ink-900">
          <p className="font-medium text-ink-900 dark:text-ink-50">Não conseguimos gerar suas direções visuais agora.</p>
          <p className="mt-1 text-sm text-ink-500">
            Você pode tentar novamente ou continuar usando o POSTTOU e voltar depois.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={this.handleRetry}>
              Tentar novamente
            </Button>
            <Button type="button" variant="outline" onClick={this.props.onSkip}>
              Pular por enquanto
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function GenerationErrorBoundary({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return <GenerationErrorBoundaryClass onSkip={() => navigate('/')}>{children}</GenerationErrorBoundaryClass>
}
