import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { generateWithAi, AiNotConfiguredError as TextNotConfiguredError, saveAiGenerationAsDraft } from '@/features/ai-generate/api'
import type { ContentIdea, IdeasGenerationResult, TextGenerationResult } from '@/features/ai-generate/types'
import { OBJECTIVE_LABEL } from '@/features/ai-generate/types'
import { getContentPages } from '@/features/content/api'
import type { ContentRow } from '@/features/content/types'
import {
  AiNotConfiguredError as ImageNotConfiguredError,
  checkImageGeneration,
  generateImageWithAi,
  getContentAssetSignedUrl,
} from '@/features/editor/api'
import {
  claimFirstContentGeneration,
  fetchOnboardingFirstContent,
  interpretVisualDnaFromContent,
  releaseFirstContentGeneration,
} from '@/features/onboarding/firstContentApi'
import { dismissOnboardingStep } from '@/features/onboarding/api'
import { InstagramNotConfiguredError, fetchInstagramAccount, startInstagramOAuth } from '@/features/instagram/api'
import { INSTAGRAM_ERROR_MESSAGES } from '@/features/instagram/types'
import type { InstagramAccountRow } from '@/features/instagram/types'

const POLL_INTERVAL_MS = 4000
const MAX_FAST_POLLS = 45 // ~3min de polling rápido (cobre o caso normal)
const SLOW_POLL_INTERVAL_MS = 15000 // depois disso, continua discretamente em vez de desistir — o recovery do backend garante conclusão em minutos mesmo parado nesta tela

type Stage =
  | 'checking'
  | 'ideas'
  | 'creating'
  | 'generating_image'
  | 'result'
  | 'proposing_visual'
  | 'visual_confirmed'
  | 'skipped_visual'
  | 'connect_instagram'
  | 'instagram_connected'

interface ResultState {
  content: ContentRow
  pageId: string | null
  imageGenerationId: string | null
  imageUrl: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  caption: string
  contentContext: string
}

/**
 * Etapa 3 — "Seu conteúdo já começou": reaproveita integralmente o
 * pipeline real (ai-generate, ai-generate-image, saveAiGenerationAsDraft,
 * checkImageGeneration) — nenhuma geração nova de conteúdo/imagem, só uma
 * orquestração automática do que já existia manualmente no Criar com IA.
 */
export function FirstContentFlow({
  workspaceId,
  onDone,
  startAtConnectInstagram = false,
}: {
  workspaceId: string
  onDone: () => void
  /** Etapa 4A — reload/reabertura em `/dna-da-marca` depois que o primeiro conteúdo já foi concluído (first_content_completed_at persistido): pula direto pra ponte do Instagram em vez de refazer ideias/criação, que já terminaram. */
  startAtConnectInstagram?: boolean
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [stage, setStage] = React.useState<Stage>(startAtConnectInstagram ? 'connect_instagram' : 'checking')
  const [ideas, setIdeas] = React.useState<ContentIdea[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ResultState | null>(null)
  const [visualSummary, setVisualSummary] = React.useState<string | null>(null)
  const [connectPhase, setConnectPhase] = React.useState<'idle' | 'redirecting'>('idle')
  const [connectError, setConnectError] = React.useState<string | null>(null)
  const [connectedAccount, setConnectedAccount] = React.useState<InstagramAccountRow | null>(null)
  const startedRef = React.useRef(false)
  const cancelledRef = React.useRef(false)
  React.useEffect(
    () => () => {
      cancelledRef.current = true
    },
    [],
  )

  // Etapa 4A — o retorno do OAuth (iniciado por esta própria tela, via
  // return_to='onboarding') chega aqui como querystring no MESMO
  // /dna-da-marca, nunca em memória — por isso funciona igual num reload
  // logo depois do callback. Nunca limpa os parâmetros sozinho: só quando
  // o usuário efetivamente segue em frente (Continuar / Fazer isso
  // depois), pra um reload no meio continuar mostrando o mesmo resultado.
  React.useEffect(() => {
    const success = searchParams.get('instagram') === 'success'
    const errorCode = searchParams.get('instagram_error')
    if (success) {
      setStage('instagram_connected')
      fetchInstagramAccount(workspaceId)
        .then((acc) => {
          if (!cancelledRef.current) setConnectedAccount(acc)
        })
        .catch(() => {})
    } else if (errorCode) {
      setConnectError(INSTAGRAM_ERROR_MESSAGES[errorCode] ?? `Não foi possível conectar (${errorCode}).`)
      setStage('connect_instagram')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearInstagramParams() {
    if (!searchParams.has('instagram') && !searchParams.has('instagram_error') && !searchParams.has('instagram_error_detail')) return
    const next = new URLSearchParams(searchParams)
    next.delete('instagram')
    next.delete('instagram_error')
    next.delete('instagram_error_detail')
    setSearchParams(next, { replace: true })
  }

  async function handleConnectInstagram() {
    setConnectPhase('redirecting')
    setConnectError(null)
    try {
      const authorizeUrl = await startInstagramOAuth(workspaceId, 'onboarding')
      window.location.href = authorizeUrl
    } catch (err) {
      setConnectError(
        err instanceof InstagramNotConfiguredError ? err.message : err instanceof Error ? err.message : 'Erro inesperado ao conectar o Instagram.',
      )
      setConnectPhase('idle')
    }
  }

  async function handleSkipInstagram() {
    clearInstagramParams()
    await dismissOnboardingStep(workspaceId, 'instagram').catch(() => {})
    onDone()
  }

  function finishAfterInstagramConnected() {
    clearInstagramParams()
    onDone()
  }

  // Nunca desiste enquanto a tela seguir montada — só reduz a frequência
  // depois da janela rápida inicial (~3min) para não bater a cada 4s pra
  // sempre. Isso é o que garante "quando visual_asset_status virar ready, a
  // arte aparece automaticamente" mesmo sem o usuário recarregar a página
  // — o recovery do backend (webhook + cron a cada 2min/timeout 3min)
  // garante que sempre há algo para este polling encontrar em poucos
  // minutos, mesmo no pior caso.
  const pollImage = React.useCallback(async (generationId: string, pageId: string, content: ResultState) => {
    let tries = 0
    let interval = POLL_INTERVAL_MS
    while (!cancelledRef.current) {
      await new Promise((r) => setTimeout(r, interval))
      if (cancelledRef.current) return
      const check = await checkImageGeneration(generationId)
      if (cancelledRef.current) return
      if (check.status === 'success' && check.resultAssetPaths[0]) {
        const url = await getContentAssetSignedUrl(check.resultAssetPaths[0])
        setResult({ ...content, pageId, imageGenerationId: generationId, imageUrl: url, imageStatus: 'ready' })
        return
      }
      if (check.status === 'failed') {
        setResult({ ...content, pageId, imageGenerationId: generationId, imageUrl: null, imageStatus: 'failed' })
        return
      }
      tries += 1
      if (tries === MAX_FAST_POLLS) {
        // Ultrapassou o tempo rápido esperado — não trava o onboarding,
        // deixa a tela seguir usável ("Continuar mesmo assim"), mas
        // continua verificando em segundo plano numa cadência mais leve.
        interval = SLOW_POLL_INTERVAL_MS
        setResult({ ...content, pageId, imageGenerationId: generationId, imageUrl: null, imageStatus: 'pending' })
      }
    }
  }, [])

  const resumeFromExistingContent = React.useCallback(
    async (content: ContentRow) => {
      const pages = await getContentPages(content.id)
      const page = pages[0] ?? null
      const contentContext = [content.title, content.caption].filter(Boolean).join('. ')
      const baseResult: ResultState = {
        content,
        pageId: page?.id ?? null,
        imageGenerationId: page?.visual_ai_generation_id ?? null,
        imageUrl: null,
        imageStatus: page?.visual_asset_status === 'ready' ? 'ready' : page?.visual_asset_status === 'failed' ? 'failed' : 'pending',
        caption: content.caption ?? '',
        contentContext,
      }

      if (page?.visual_asset_status === 'ready') {
        const { data: imageEl } = await supabase
          .from('content_elements')
          .select('content')
          .eq('page_id', page.id)
          .eq('type', 'image')
          .maybeSingle()
        const path = (imageEl?.content as { path?: string } | null)?.path
        const url = path ? await getContentAssetSignedUrl(path) : null
        setResult({ ...baseResult, imageUrl: url })
      } else {
        setResult(baseResult)
      }

      setStage('result')

      // Se a imagem ainda está "generating" (ex.: usuário recarregou a
      // página no meio da espera), volta a acompanhar via polling — a
      // geração em si nunca foi perdida.
      if (page?.visual_asset_status === 'generating' && page.visual_ai_generation_id) {
        setStage('generating_image')
        void pollImage(page.visual_ai_generation_id, page.id, baseResult)
      }
    },
    [pollImage],
  )

  // Um único uso: verifica se este workspace já tem o conteúdo do
  // onboarding (reload/fechar/reabrir) antes de gerar ideias de novo —
  // nunca duplica conteúdo.
  React.useEffect(() => {
    if (startAtConnectInstagram) return
    if (startedRef.current) return
    startedRef.current = true
    void (async () => {
      try {
        const existing = await fetchOnboardingFirstContent(workspaceId)
        if (existing) {
          await resumeFromExistingContent(existing)
          return
        }
        setStage('ideas')
        const res = await generateWithAi({
          workspaceId,
          generationType: 'ideias_onboarding',
          themeInput: 'Primeiras ideias de conteúdo para o onboarding — 3 objetivos diferentes, direto ao ponto.',
        })
        const ideasResult = res.result as IdeasGenerationResult
        setIdeas(ideasResult.ideas.slice(0, 3))
      } catch (err) {
        setError(err instanceof TextNotConfiguredError ? err.message : err instanceof Error ? err.message : 'Não conseguimos gerar suas ideias agora.')
        setStage('ideas')
        setIdeas([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pickIdea(idea: ContentIdea) {
    setError(null)
    setStage('creating')
    let claimedByThisCall = false
    let contentCreated = false
    try {
      // Idempotência real (banco): só quem ganha este UPDATE atômico
      // prossegue. Clique duplo / refresh no meio da criação / aba
      // duplicada nunca resulta em dois conteúdos, duas gerações ou dois
      // débitos — a perdedora recua e reaproveita o que já existe.
      const claimed = await claimFirstContentGeneration(workspaceId)
      if (!claimed) {
        const existing = await fetchOnboardingFirstContent(workspaceId)
        if (existing) {
          await resumeFromExistingContent(existing)
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
        const existingRetry = await fetchOnboardingFirstContent(workspaceId)
        if (existingRetry) {
          await resumeFromExistingContent(existingRetry)
          return
        }
        setError('Este conteúdo já está sendo criado. Aguarde um instante e tente novamente.')
        setStage('ideas')
        return
      }
      claimedByThisCall = true

      const themeInput = [idea.title, idea.description].filter(Boolean).join(' — ')

      const textRes = await generateWithAi({
        workspaceId,
        generationType: 'post_unico',
        themeInput,
        objective: idea.objective,
        format: '4:5',
      })
      const textResult = textRes.result as TextGenerationResult

      const content = await saveAiGenerationAsDraft(workspaceId, textRes.generationId, 'post_unico', textResult, themeInput, 'ia', undefined, '4:5')
      contentCreated = true
      const pages = await getContentPages(content.id)
      const page = pages[0]
      const contentContext = [idea.title, idea.description, textResult.caption].filter(Boolean).join('. ')

      const baseResult: ResultState = {
        content,
        pageId: page?.id ?? null,
        imageGenerationId: null,
        imageUrl: null,
        imageStatus: 'pending',
        caption: textResult.caption,
        contentContext,
      }

      if (!page) {
        setResult(baseResult)
        setStage('result')
        return
      }

      setStage('generating_image')
      const imgRes = await generateImageWithAi({
        workspaceId,
        contentId: content.id,
        prompt: [idea.title, idea.description].filter(Boolean).join('. '),
        format: '4:5',
        pageId: page.id,
      })
      setResult({ ...baseResult, imageGenerationId: imgRes.generationId })
      await pollImage(imgRes.generationId, page.id, baseResult)
      setStage('result')
    } catch (err) {
      // Só libera a claim se o conteúdo nunca chegou a ser criado — se já
      // existe (só a imagem falhou), o próximo mount recupera via
      // fetchOnboardingFirstContent, não precisa de um novo clique.
      if (claimedByThisCall && !contentCreated) {
        await releaseFirstContentGeneration(workspaceId).catch(() => {})
      }
      setError(err instanceof ImageNotConfiguredError ? err.message : err instanceof Error ? err.message : 'Não conseguimos criar o conteúdo agora.')
      setStage('ideas')
    }
  }

  // Marca a conclusão do fluxo de forma persistida (não em memória) — sem
  // isso, um reload após o conteúdo já existir mas antes do usuário decidir
  // a direção visual perderia o "justCompleted" e cairia de volta no wizard
  // de DNA em vez de retomar aqui.
  async function markFirstContentDone() {
    try {
      await supabase.from('brand_profiles').update({ first_content_completed_at: new Date().toISOString() }).eq('workspace_id', workspaceId)
    } catch {
      // não bloqueia a navegação do usuário por causa disso
    }
  }

  async function finishFlow() {
    await markFirstContentDone()
    setStage('connect_instagram')
  }

  async function chooseOtherDirection() {
    await markFirstContentDone()
    navigate('/dna-da-marca/visual')
  }

  async function proposeVisualDirection() {
    if (!result) return
    setStage('proposing_visual')
    setError(null)
    try {
      const res = await interpretVisualDnaFromContent({
        workspaceId,
        contentContext: result.contentContext,
        contentId: result.content.id,
      })
      setVisualSummary(res.attributesSummary)
      setStage('visual_confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não conseguimos interpretar sua direção visual agora.')
      setStage('result')
    }
  }

  if (stage === 'checking' || stage === 'ideas') {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <span className="text-3xl" aria-hidden>
            ✨
          </span>
          <h2 className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-50">Seu conteúdo já começou</h2>
          <p className="mt-1 text-sm text-ink-500">
            Com base no que aprendemos sobre sua marca, preparamos algumas ideias para você.
          </p>

          {!ideas && (
            <div className="mt-8 flex flex-col items-center gap-3 py-6">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
              <p className="text-sm text-ink-500">Pensando em ideias para sua marca...</p>
            </div>
          )}

          {ideas && ideas.length > 0 && (
            <div className="mt-6 flex flex-col gap-3 text-left">
              {ideas.map((idea, i) => (
                <Card key={i}>
                  <CardContent className="flex flex-col gap-2 py-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-900 dark:text-ink-50">{idea.title}</p>
                      {idea.objective && <Badge variant="brand">{OBJECTIVE_LABEL[idea.objective]}</Badge>}
                    </div>
                    <p className="text-sm text-ink-500">{idea.description}</p>
                    <Button size="sm" className="self-start" onClick={() => pickIdea(idea)}>
                      Criar este conteúdo
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {ideas && ideas.length === 0 && (
            <div className="mt-6 flex flex-col items-center gap-3">
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <Button variant="outline" onClick={finishFlow}>
                Ir para o Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (stage === 'creating') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-ink-600 dark:text-ink-300">Criando seu primeiro conteúdo...</p>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'generating_image') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-ink-600 dark:text-ink-300">Estamos finalizando sua arte...</p>
          <p className="text-xs text-ink-400">
            Isso pode levar alguns minutos. Você pode continuar usando o POSTTOU e voltar depois — nada será perdido.
          </p>
          {result && (
            <Button variant="ghost" size="sm" onClick={() => setStage('result')}>
              Continuar mesmo assim
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (stage === 'result' && result) {
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Olha o que o POSTTOU criou para você ✨</h2>

          <div className="mt-4 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
            <div className="aspect-[4/5] w-full bg-ink-100 dark:bg-ink-800">
              {result.imageUrl ? (
                <img src={result.imageUrl} alt="Primeira arte criada pelo POSTTOU" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-ink-400">
                  {result.imageStatus === 'failed'
                    ? 'Não conseguimos gerar a arte — você pode tentar de novo depois em "Meu Conteúdo".'
                    : 'Ainda finalizando a arte — ela aparece aqui assim que ficar pronta.'}
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-sm text-ink-700 dark:text-ink-200">{result.caption}</p>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-danger-500">{error}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={proposeVisualDirection}>Continuar</Button>
            <Button variant="outline" onClick={() => navigate(`/conteudo/${result.content.id}/editor`)}>
              Ver/editar no Editor
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'proposing_visual') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-ink-600 dark:text-ink-300">Interpretando sua direção visual...</p>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'visual_confirmed' && result) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <span className="text-3xl" aria-hidden>
            ✨
          </span>
          <h2 className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-50">Criamos uma primeira direção visual para sua marca</h2>
          {result.imageUrl && (
            <div className="mx-auto mt-4 max-w-[220px] overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
              <img src={result.imageUrl} alt="Direção visual proposta" className="aspect-[4/5] w-full object-cover" />
            </div>
          )}
          {visualSummary && <p className="mt-3 text-sm font-medium text-ink-800 dark:text-ink-100">{visualSummary}</p>}
          <p className="mt-2 text-xs text-ink-400">
            Isso é uma sugestão — você pode ajustar tudo depois em DNA Visual.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={finishFlow}>Gostei, usar este estilo</Button>
            <Button variant="outline" onClick={chooseOtherDirection}>
              Quero outra direção
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'connect_instagram') {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <span className="text-3xl" aria-hidden>
            🎉
          </span>
          <h2 className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-50">Seu primeiro conteúdo está pronto.</h2>
          <p className="mt-2 text-sm text-ink-500">Agora conecte seu Instagram para publicar com o POSTTOU.</p>

          {connectError && <p className="mt-4 text-sm text-danger-500">{connectError}</p>}

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button onClick={handleConnectInstagram} disabled={connectPhase === 'redirecting'}>
              {connectPhase === 'redirecting' ? 'Redirecionando…' : 'Conectar meu Instagram'}
            </Button>
            <button type="button" className="text-xs text-ink-400 hover:underline" onClick={handleSkipInstagram}>
              Fazer isso depois
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'instagram_connected') {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <span className="text-3xl" aria-hidden>
            🎉
          </span>
          <h2 className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-50">Instagram conectado!</h2>
          {connectedAccount?.username && (
            <p className="mt-1 text-sm font-medium text-ink-700 dark:text-ink-200">@{connectedAccount.username}</p>
          )}
          <p className="mt-2 text-sm text-ink-500">Agora você já pode publicar seus conteúdos pelo POSTTOU.</p>
          <div className="mt-6">
            <Button onClick={finishAfterInstagramConnected}>Continuar</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
