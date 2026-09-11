import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { getContent, getContentPages, getContentPageThumbnails } from '@/features/content/api'
import { retryPilotVisualAsset } from '@/features/pilot/api'
import { Button } from '@/components/ui/button'
import { SchedulePublishDialog } from '@/features/instagram-publish/SchedulePublishDialog'

/**
 * Tela de resultado do fluxo "Criar com IA → Post único": mostra a arte
 * já gerada (ou o estado de geração em andamento) junto da legenda,
 * hashtags e CTA, com PUBLICAR como ação principal e EDITAR como
 * secundária — o usuário só entra no Editor Visual se pedir
 * explicitamente. Nunca redireciona sozinho para o editor.
 */
export function PostReadyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeWorkspace, hasRole } = useWorkspace()
  const tz = activeWorkspace?.timezone ?? 'America/Sao_Paulo'
  const canSchedule = hasRole(['owner', 'admin', 'editor'])
  const canPublishNow = hasRole(['owner', 'admin'])

  const [retrying, setRetrying] = React.useState(false)
  const [publishDialog, setPublishDialog] = React.useState<'schedule' | 'publish_now' | null>(null)
  const [showPublishChoice, setShowPublishChoice] = React.useState(false)

  const { data: content } = useQuery({ queryKey: ['content', id], enabled: !!id, queryFn: () => getContent(id!) })

  const { data: pages } = useQuery({
    queryKey: ['content-pages', id],
    enabled: !!id,
    queryFn: () => getContentPages(id!),
    refetchInterval: (query) => {
      const p = query.state.data?.[0]
      return p && (p.visual_asset_status === 'pending' || p.visual_asset_status === 'generating') ? 4000 : false
    },
  })

  const page = pages?.[0]

  const { data: thumbnails } = useQuery({
    queryKey: ['content-page-thumbnails', id, page?.visual_asset_status, page?.visual_ai_generation_id],
    enabled: !!page && page.visual_asset_status === 'ready',
    queryFn: () => getContentPageThumbnails(pages!),
  })

  const thumbnailUrl = page ? thumbnails?.[page.id] : undefined

  async function handleRetry() {
    if (!page) return
    setRetrying(true)
    try {
      await retryPilotVisualAsset(page.id)
      queryClient.invalidateQueries({ queryKey: ['content-pages', id] })
    } catch (err) {
      console.error('Não foi possível tentar gerar a arte novamente.', err)
    } finally {
      setRetrying(false)
    }
  }

  if (!content || !page) {
    return <div className="p-6 text-sm text-ink-400">Carregando…</div>
  }

  const isGenerating = page.visual_asset_status === 'pending' || page.visual_asset_status === 'generating'
  const isFailed = page.visual_asset_status === 'failed'
  const isReady = page.visual_asset_status === 'ready'
  const canPublishAtAll = canSchedule || canPublishNow

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <Link to="/conteudo" className="text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
        ← Meu Conteúdo
      </Link>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-ink-50 dark:bg-ink-800">
          {isReady && thumbnailUrl ? (
            <img src={thumbnailUrl} alt={content.title} className="h-full w-full object-cover" />
          ) : isFailed ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="text-3xl" aria-hidden>⚠️</span>
              <p className="text-sm text-danger-500">Não conseguimos gerar a arte automaticamente.</p>
              <Button size="sm" variant="outline" disabled={retrying} onClick={handleRetry}>
                {retrying ? 'Tentando…' : 'Tentar gerar arte novamente'}
              </Button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
              <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Gerando sua arte com IA…</p>
              <p className="text-xs text-ink-400">Isso pode levar até 1-2 minutos.</p>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-ink-400">Sem arte gerada para esta página.</p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <h1 className="text-base font-semibold text-ink-900 dark:text-ink-50">{content.title}</h1>
          {content.caption && <p className="whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-300">{content.caption}</p>}
          {!!content.hashtags?.length && (
            <p className="text-sm text-brand-600">{content.hashtags.map((h) => `#${h}`).join(' ')}</p>
          )}
          {content.cta && <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{content.cta}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {showPublishChoice ? (
            <div className="flex gap-2">
              {canPublishNow && (
                <Button className="flex-1" disabled={!isReady} onClick={() => setPublishDialog('publish_now')}>
                  Publicar agora
                </Button>
              )}
              {canSchedule && (
                <Button className="flex-1" variant="outline" disabled={!isReady} onClick={() => setPublishDialog('schedule')}>
                  Agendar
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowPublishChoice(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            canPublishAtAll && (
              <Button size="lg" disabled={!isReady} onClick={() => setShowPublishChoice(true)}>
                Publicar
              </Button>
            )
          )}
          <Button variant="outline" onClick={() => navigate(`/conteudo/${id}/editor`)}>
            Editar
          </Button>
        </div>
      </div>

      {publishDialog && activeWorkspace && content && (
        <SchedulePublishDialog
          content={content}
          workspaceId={activeWorkspace.id}
          timezone={tz}
          publishNowMode={publishDialog === 'publish_now'}
          onClose={() => setPublishDialog(null)}
          onDone={() => {
            setPublishDialog(null)
            navigate(`/conteudo/${id}`)
          }}
        />
      )}
    </div>
  )
}
