import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PosttouMark } from '@/components/brand/PosttouMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DiscoveryNotConfiguredError, getDiscoveryStatus, startDiscovery } from '@/features/instagram-discovery/api'
import { clearDiscoveryToken, readDiscoveryToken, saveDiscoveryToken } from '@/features/instagram-discovery/session-token'
import {
  DISCOVERY_ERROR_MESSAGES,
  extractDiscoveryIdeas,
} from '@/features/instagram-discovery/types'
import type { DiscoveryDna, DiscoveryGetResult, DiscoveryStartResult } from '@/features/instagram-discovery/types'
import { DnaReviewCards, type DnaReviewState } from '@/features/instagram-discovery/DnaReviewCards'
import { ContentPreviewCards } from '@/features/instagram-discovery/ContentPreviewCards'

type Stage = 'handle' | 'loading' | 'dna' | 'previews' | 'signup' | 'error' | 'not_configured'

// Etapas puramente narrativas do processamento — nunca afirmam um dado
// específico já encontrado (isso só aparece na tela de resultado, quando
// já é real). Servem só para a espera parecer intencional, não travada.
const ANALYSIS_STEPS = [
  'Entendendo seu posicionamento',
  'Identificando seus principais assuntos',
  'Conhecendo o público da sua marca',
  'Preparando seu DNA',
]

export function DiscoveryLandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [stage, setStage] = React.useState<Stage>('handle')
  const [handleInput, setHandleInput] = React.useState('')
  const [progressIndex, setProgressIndex] = React.useState(0)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<DiscoveryStartResult | DiscoveryGetResult | null>(null)
  const [dnaReview, setDnaReview] = React.useState<DnaReviewState | null>(null)
  const [token, setToken] = React.useState<string | null>(null)

  async function runDiscovery(handle: string) {
    setErrorMessage(null)
    setStage('loading')
    try {
      const res = await startDiscovery(handle)
      if (res.status === 'failed') {
        setErrorMessage(DISCOVERY_ERROR_MESSAGES[res.error ?? ''] ?? res.message ?? 'Não foi possível analisar esse perfil.')
        setStage('error')
        return
      }
      saveDiscoveryToken(res.token)
      setToken(res.token)
      setResult(res)
      setDnaReview(null)
      setStage(res.dna ? 'dna' : 'error')
    } catch (err) {
      if (err instanceof DiscoveryNotConfiguredError) {
        setStage('not_configured')
        return
      }
      setErrorMessage(err instanceof Error ? err.message : 'Não foi possível analisar esse perfil.')
      setStage('error')
    }
  }

  // Na entrada: primeiro tenta restaurar uma sessão já em andamento
  // (sessionStorage); só se não houver nenhuma é que considera o @ vindo
  // da landing (?handle=) e dispara a análise automaticamente — nunca
  // sobrescreve uma sessão real já pronta. Restaura também a revisão de
  // DNA já salva (dnaRevisado) e o estágio onde o visitante parou
  // (flowStage) — um refresh nunca deve voltar pra sugestão original
  // nem para uma tela anterior à que ele já tinha alcançado.
  React.useEffect(() => {
    let cancelled = false

    async function init() {
      const existingToken = readDiscoveryToken()
      if (existingToken) {
        setStage('loading')
        try {
          const res = await getDiscoveryStatus(existingToken)
          if (cancelled) return
          if (res.status === 'ready' && res.dna) {
            setToken(existingToken)
            setResult(res)
            const restoredReview = (res.dnaRevisado as DnaReviewState | null | undefined) ?? null
            setDnaReview(restoredReview)

            const canRestoreTo = (target: Stage) => target !== 'previews' && target !== 'signup' ? true : !!restoredReview
            const desired: Stage = res.flowStage === 'previews' || res.flowStage === 'signup' ? res.flowStage : 'dna'
            setStage(canRestoreTo(desired) ? desired : 'dna')
            return
          }
          clearDiscoveryToken()
          setStage('handle')
        } catch {
          if (cancelled) return
          clearDiscoveryToken()
          setStage('handle')
        }
      }

      const handleFromLanding = searchParams.get('handle')
      if (!cancelled && handleFromLanding) {
        setHandleInput(handleFromLanding)
        void runDiscovery(handleFromLanding)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (stage !== 'loading') return
    setProgressIndex(0)
    const interval = window.setInterval(() => {
      setProgressIndex((i) => Math.min(i + 1, ANALYSIS_STEPS.length - 1))
    }, 1400)
    return () => window.clearInterval(interval)
  }, [stage])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await runDiscovery(handleInput)
  }

  function reset() {
    clearDiscoveryToken()
    setResult(null)
    setDnaReview(null)
    setToken(null)
    setErrorMessage(null)
    setStage('handle')
  }

  const dna = result?.dna as DiscoveryDna | null | undefined
  const ideias = extractDiscoveryIdeas(result)
  const profile = result && 'profile' in result ? result.profile : undefined

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-10 dark:bg-ink-950">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <PosttouMark size={48} />
        <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-50">POSTTOU</h1>
        <p className="text-xs text-ink-400">Seu conteúdo. Sua marca. Sua IA.</p>
      </div>

      <div className="mx-auto mt-10 max-w-2xl">
        {stage === 'handle' && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                Descubra o DNA da sua marca em segundos
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Informe o @ do seu Instagram. A gente analisa seu perfil público e já monta um DNA de marca e 5
                ideias de conteúdo — antes mesmo de você criar conta.
              </p>
              <form className="mt-6 flex gap-2" onSubmit={handleSubmit}>
                <Input
                  placeholder="@seuinstagram"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  required
                  autoFocus
                />
                <Button type="submit">Analisar</Button>
              </form>
              <p className="mt-3 text-xs text-ink-400">
                Só usamos dados públicos e oficiais da API da Meta. Nada é publicado nem alterado no seu perfil.
              </p>
            </CardContent>
          </Card>
        )}

        {stage === 'loading' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-6 px-4 py-10 text-center sm:py-12">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600 dark:border-brand-900 dark:border-t-brand-400" />
                <PosttouMark size={26} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Estamos conhecendo sua marca…
                </h2>
                <p className="mt-1 text-sm text-ink-500">Isso leva só alguns segundos.</p>
              </div>
              <ul className="flex w-full max-w-xs flex-col gap-3 text-left">
                {ANALYSIS_STEPS.map((step, i) => {
                  const isDone = i < progressIndex
                  const isCurrent = i === progressIndex
                  return (
                    <li key={step} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                          isDone && 'bg-brand-600 text-white',
                          isCurrent && !isDone && 'border-2 border-brand-500',
                          !isDone && !isCurrent && 'border border-ink-200 dark:border-ink-700',
                        )}
                      >
                        {isDone ? '✓' : isCurrent ? (
                          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'text-sm transition-colors',
                          isCurrent && 'font-medium text-ink-900 dark:text-ink-50',
                          isDone && 'text-ink-500 dark:text-ink-400',
                          !isDone && !isCurrent && 'text-ink-300 dark:text-ink-600',
                        )}
                      >
                        {step}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {stage === 'not_configured' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                Vamos conhecer sua marca de outro jeito
              </p>
              <p className="text-sm text-ink-600 dark:text-ink-300">
                Ainda não conseguimos analisar esse perfil automaticamente. Crie sua conta grátis e conte em
                poucas frases o que sua marca faz — o POSTTOU monta o DNA da mesma forma.
              </p>
              <Button onClick={() => navigate('/cadastro')}>Criar minha conta grátis</Button>
            </CardContent>
          </Card>
        )}

        {stage === 'error' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-sm text-danger-500">{errorMessage}</p>
              <Button variant="outline" onClick={reset}>
                Tentar outro @
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === 'dna' && dna && token && (
          <DnaReviewCards
            dna={dna}
            profile={profile}
            token={token}
            initialState={dnaReview}
            onContinue={(editedState) => {
              setDnaReview(editedState)
              setStage('previews')
            }}
          />
        )}

        {stage === 'previews' && dnaReview && token && (
          <ContentPreviewCards ideas={ideias} dna={dnaReview} token={token} onContinue={() => setStage('signup')} />
        )}

        {stage === 'signup' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
              {profile?.profilePictureUrl && (
                <img src={profile.profilePictureUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              )}
              <div>
                <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">Seu conteúdo já começou. ✨</p>
                <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
                  Crie sua conta para salvar seu DNA, suas ideias e continuar criando com o POSTTOU.
                </p>
              </div>
              <ul className="flex flex-col gap-1.5 self-center text-sm text-ink-700 dark:text-ink-200">
                <li className="flex items-center gap-2">
                  <span className="font-bold text-brand-600">✓</span> 3 dias grátis
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-brand-600">✓</span> Sem cartão
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-brand-600">✓</span> 50 créditos para experimentar
                </li>
              </ul>
              <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/cadastro')}>
                  Criar minha conta e continuar
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/entrar')}>
                  Já tenho conta
                </Button>
              </div>
              <button type="button" className="text-xs text-ink-400 hover:underline" onClick={reset}>
                Analisar outro @
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
