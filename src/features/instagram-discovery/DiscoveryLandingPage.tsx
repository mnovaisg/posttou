import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PosttouMark } from '@/components/brand/PosttouMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthProvider'
import { DiscoveryNotConfiguredError, getDiscoveryStatus, startDiscovery } from '@/features/instagram-discovery/api'
import {
  clearDiscoveryToken,
  readDiscoveryToken,
  saveDiscoveryToken,
  saveSelectedIdeaIndex,
} from '@/features/instagram-discovery/session-token'
import {
  DISCOVERY_ERROR_MESSAGES,
  extractDiscoveryIdeas,
} from '@/features/instagram-discovery/types'
import type { DiscoveryDna, DiscoveryGetResult, DiscoveryStartResult } from '@/features/instagram-discovery/types'

type Stage = 'handle' | 'loading' | 'result' | 'error' | 'not_configured'

const PROGRESS_MESSAGES = [
  'Buscando o perfil no Instagram…',
  'Lendo posts públicos e legendas recentes…',
  'Montando seu DNA de marca com IA…',
]

export function DiscoveryLandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [stage, setStage] = React.useState<Stage>('handle')
  const [handleInput, setHandleInput] = React.useState('')
  const [progressIndex, setProgressIndex] = React.useState(0)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<DiscoveryStartResult | DiscoveryGetResult | null>(null)

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
      setResult(res)
      setStage('result')
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
  // sobrescreve uma sessão real já pronta.
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
            setResult(res)
            setStage('result')
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
      setProgressIndex((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1))
    }, 1800)
    return () => window.clearInterval(interval)
  }, [stage])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await runDiscovery(handleInput)
  }

  function reset() {
    clearDiscoveryToken()
    setResult(null)
    setErrorMessage(null)
    setStage('handle')
  }

  /**
   * CTA "Criar este conteúdo" numa ideia específica. O token já está em
   * sessionStorage (salvo assim que a análise ficou pronta); aqui só
   * marcamos qual ideia foi escolhida, pelo índice — resolvida contra o
   * array real de ideias retornado pelo claim, nunca confiado do
   * cliente. Se o visitante já estiver autenticado, o mesmo hook de
   * claim (montado no layout protegido) cuida do resto; se anônimo,
   * segue para cadastro preservando a seleção.
   */
  function handleCreateFromIdea(index: number) {
    if (!result || result.status === 'failed') return
    saveSelectedIdeaIndex(index)
    navigate(user ? '/' : '/cadastro')
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
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
              <p className="text-sm text-ink-600 dark:text-ink-300">{PROGRESS_MESSAGES[progressIndex]}</p>
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

        {stage === 'result' && dna && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  {profile?.profilePictureUrl && (
                    <img
                      src={profile.profilePictureUrl}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                      @{result?.handle}
                    </p>
                    {typeof profile?.followersCount === 'number' && (
                      <p className="text-xs text-ink-400">
                        {profile.followersCount.toLocaleString('pt-BR')} seguidores
                      </p>
                    )}
                  </div>
                </div>

                <h2 className="mt-5 text-lg font-semibold text-ink-900 dark:text-ink-50">Seu DNA preliminar</h2>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{dna.identidade?.descricao?.value}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {dna.identidade?.nicho?.value && <Badge variant="brand">{dna.identidade.nicho.value}</Badge>}
                  {dna.voz?.tom?.value && <Badge>{dna.voz.tom.value}</Badge>}
                  {dna.voz?.personalidade?.slice(0, 4).map((trait) => (
                    <Badge key={trait} variant="neutral">
                      {trait}
                    </Badge>
                  ))}
                </div>

                {dna.publico?.publico_provavel?.value && (
                  <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">
                    <span className="font-medium text-ink-800 dark:text-ink-100">Público provável: </span>
                    {dna.publico.publico_provavel.value}
                  </p>
                )}

                <p className="mt-4 text-xs text-ink-400">
                  Isso é uma sugestão preliminar da IA a partir de dados públicos — você vai poder revisar e
                  ajustar tudo depois de criar sua conta.
                </p>
              </CardContent>
            </Card>

            {ideias.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
                  5 ideias de conteúdo para você
                </h3>
                <div className="flex flex-col gap-3">
                  {ideias.map((idea, i) => (
                    <Card key={i}>
                      <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-ink-900 dark:text-ink-50">{idea.titulo}</p>
                          <Badge variant="neutral">{idea.formato}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{idea.resumo}</p>
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => handleCreateFromIdea(i)}>
                            Criar este conteúdo
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-ink-600 dark:text-ink-300">
                  Crie sua conta grátis para aprovar esse DNA e começar a gerar conteúdo com IA.
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => navigate('/cadastro')}>Criar minha conta grátis</Button>
                  <Button variant="outline" onClick={() => navigate('/entrar')}>
                    Já tenho conta
                  </Button>
                </div>
                <button type="button" className="text-xs text-ink-400 hover:underline" onClick={reset}>
                  Analisar outro @
                </button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
