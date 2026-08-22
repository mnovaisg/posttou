import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getContent,
  getContentPages,
  updateContent,
  transitionStatus,
  duplicateContent,
  softDeleteContent,
} from '@/features/content/api'
import {
  ORIGIN_LABEL,
  PAGE_DIMENSIONS_BY_FORMAT,
  STATUS_LABEL,
  TYPE_ICON,
  TYPE_LABEL,
} from '@/features/content/types'
import type { ContentStatus } from '@/features/content/types'
import { StatusBadge } from '@/features/content/components/StatusBadge'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { zonedTimeToUtc, getDatePartsInTimeZone, formatInTimeZone } from '@/lib/timezone'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { SchedulePublishDialog } from '@/features/instagram-publish/SchedulePublishDialog'
import { fetchActivePublication, cancelPublication, reschedulePublication } from '@/features/instagram-publish/api'
import { PUBLICATION_STATUS_LABEL } from '@/features/instagram-publish/types'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeWorkspace, hasRole } = useWorkspace()
  const tz = activeWorkspace?.timezone ?? 'America/Sao_Paulo'

  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState('')
  const [publishDialog, setPublishDialog] = React.useState<'schedule' | 'publish_now' | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false)
  const [rescheduleDate, setRescheduleDate] = React.useState('')
  const [rescheduleTime, setRescheduleTime] = React.useState('')
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const { data: content, isLoading } = useQuery({
    queryKey: ['content', id],
    enabled: !!id,
    queryFn: () => getContent(id!),
  })

  const { data: pages } = useQuery({
    queryKey: ['content-pages', id],
    enabled: !!id,
    queryFn: () => getContentPages(id!),
  })

  const { data: activePublication } = useQuery({
    queryKey: ['instagram-publication', id],
    enabled: !!id && !!content && ['agendado', 'publicando', 'publicado', 'falhou'].includes(content.status),
    queryFn: () => fetchActivePublication(id!),
    refetchInterval: (query) => (query.state.data?.status === 'processing' || query.state.data?.status === 'container_created' || query.state.data?.status === 'publishing' ? 4000 : false),
  })

  const [draft, setDraft] = React.useState<{ title: string; caption: string; hashtags: string[]; cta: string } | null>(null)

  React.useEffect(() => {
    if (content && !draft) {
      setDraft({
        title: content.title,
        caption: content.caption ?? '',
        hashtags: content.hashtags ?? [],
        cta: content.cta ?? '',
      })
    }
  }, [content, draft])

  const canEdit = hasRole(['owner', 'admin', 'editor'])
  const canApprove = hasRole(['owner', 'admin', 'approver'])
  const canAdmin = hasRole(['owner', 'admin'])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['content', id] })
    queryClient.invalidateQueries({ queryKey: ['contents'] })
    queryClient.invalidateQueries({ queryKey: ['content-summary'] })
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateContent(id!, {
        title: draft!.title,
        caption: draft!.caption || null,
        hashtags: draft!.hashtags,
        cta: draft!.cta || null,
      }),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  })

  const transitionMutation = useMutation({
    mutationFn: (vars: { status: ContentStatus; extra?: Parameters<typeof transitionStatus>[2] }) =>
      transitionStatus(id!, vars.status, vars.extra),
    onSuccess: () => {
      invalidate()
      setActionError(null)
      setRejectOpen(false)
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : 'Transição não permitida.'),
  })

  const cancelPublicationMutation = useMutation({
    mutationFn: () => cancelPublication(id!),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['instagram-publication', id] })
      setActionError(null)
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : 'Não foi possível cancelar.'),
  })

  const reschedulePublicationMutation = useMutation({
    mutationFn: (scheduledAtIso: string) => reschedulePublication(id!, scheduledAtIso),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['instagram-publication', id] })
      setActionError(null)
      setRescheduleOpen(false)
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : 'Não foi possível reagendar.'),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateContent(content!),
    onSuccess: (newContent) => {
      invalidate()
      navigate(`/conteudo/${newContent.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteContent(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ queryKey: ['content-summary'] })
      navigate('/conteudo')
    },
  })

  function openReschedule() {
    if (content?.scheduled_at) {
      const parts = getDatePartsInTimeZone(content.scheduled_at, tz)
      setRescheduleDate(parts.date)
      setRescheduleTime(parts.time)
    }
    setRescheduleOpen(true)
  }

  function confirmReschedule() {
    if (!rescheduleDate || !rescheduleTime) return
    const utc = zonedTimeToUtc(rescheduleDate, rescheduleTime, tz)
    reschedulePublicationMutation.mutate(utc.toISOString())
  }

  if (isLoading || !content || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const dirty =
    draft.title !== content.title ||
    draft.caption !== (content.caption ?? '') ||
    draft.cta !== (content.cta ?? '') ||
    JSON.stringify(draft.hashtags) !== JSON.stringify(content.hashtags ?? [])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/conteudo" className="text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
          ← Meu Conteúdo
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={content.status} />
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
              Duplicar
            </Button>
          )}
          {canAdmin && (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <div className="mb-4 flex items-center gap-2 text-xs text-ink-400">
          <span>{TYPE_ICON[content.type]} {TYPE_LABEL[content.type]}</span>
          <span>·</span>
          <span>{content.format}</span>
          <span>·</span>
          <span>Origem: {ORIGIN_LABEL[content.origin]}</span>
          {content.duplicated_from && (
            <>
              <span>·</span>
              <Link to={`/conteudo/${content.duplicated_from}`} className="underline">
                duplicado de outro conteúdo
              </Link>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={draft.title}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              rows={4}
              value={draft.caption}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hashtags</Label>
            <TagInput value={draft.hashtags} onChange={(v) => setDraft({ ...draft, hashtags: v })} placeholder="Digite e pressione Enter" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cta">CTA</Label>
            <Input id="cta" value={draft.cta} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
          </div>

          {canEdit && dirty && (
            <Button size="sm" className="self-start" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">
            Páginas ({pages?.length ?? 0})
          </h3>
          <Button size="sm" onClick={() => navigate(`/conteudo/${id}/editor`)}>
            {canEdit ? 'Abrir no editor' : 'Visualizar no editor'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          {(pages ?? []).map((page, idx) => {
            const dims = PAGE_DIMENSIONS_BY_FORMAT[content.format]
            const ratio = dims.height / dims.width
            return (
              <div
                key={page.id}
                style={{ width: 90, height: 90 * ratio }}
                className="flex items-center justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50 text-xs text-ink-400 dark:border-ink-600 dark:bg-ink-800"
              >
                {idx + 1}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h3 className="mb-3 text-sm font-semibold text-ink-900 dark:text-ink-50">Fluxo</h3>

        {content.status === 'rejeitado' && content.rejection_reason && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <strong>Motivo da rejeição:</strong> {content.rejection_reason}
          </p>
        )}

        {content.scheduled_at && (content.status === 'agendado') && (
          <p className="mb-2 text-sm text-ink-600 dark:text-ink-300">
            Agendado para <strong>{formatInTimeZone(content.scheduled_at, tz, { dateStyle: 'full', timeStyle: 'short' })}</strong>
            {activePublication?.status && activePublication.claimed_at && (
              <> — {PUBLICATION_STATUS_LABEL[activePublication.status]}</>
            )}
          </p>
        )}

        {content.status === 'publicando' && (
          <p className="mb-4 flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            Publicando no Instagram… ({activePublication ? PUBLICATION_STATUS_LABEL[activePublication.status] : 'processando'})
          </p>
        )}

        {content.status === 'publicado' && activePublication?.permalink && (
          <p className="mb-4 text-sm text-ink-600 dark:text-ink-300">
            Publicado em{' '}
            <a href={activePublication.permalink} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
              {activePublication.permalink}
            </a>
            {content.published_at && <> — {formatInTimeZone(content.published_at, tz, { dateStyle: 'full', timeStyle: 'short' })}</>}
          </p>
        )}

        {content.status === 'falhou' && activePublication?.last_error_message && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <strong>Falha na publicação:</strong> {activePublication.last_error_message}
          </p>
        )}

        {actionError && <p className="mb-3 text-sm text-danger-500">{actionError}</p>}

        <div className="flex flex-wrap gap-2">
          {content.status === 'rascunho' && canEdit && (
            <Button size="sm" onClick={() => transitionMutation.mutate({ status: 'em_revisao' })}>
              Enviar para revisão
            </Button>
          )}

          {content.status === 'em_revisao' && canApprove && (
            <>
              <Button size="sm" onClick={() => transitionMutation.mutate({ status: 'aprovado' })}>
                Aprovar
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
                Rejeitar
              </Button>
            </>
          )}
          {content.status === 'em_revisao' && (canEdit || canApprove) && (
            <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ status: 'rascunho' })}>
              Voltar para rascunho
            </Button>
          )}

          {content.status === 'rejeitado' && canEdit && (
            <Button size="sm" onClick={() => transitionMutation.mutate({ status: 'rascunho' })}>
              Editar e reenviar
            </Button>
          )}

          {content.status === 'aprovado' && content.type !== 'reel' && canEdit && (
            <Button size="sm" onClick={() => setPublishDialog('schedule')}>
              Agendar
            </Button>
          )}
          {content.status === 'aprovado' && content.type !== 'reel' && canAdmin && (
            <Button size="sm" variant="outline" onClick={() => setPublishDialog('publish_now')}>
              Publicar agora
            </Button>
          )}
          {content.status === 'aprovado' && content.type === 'reel' && (
            <p className="text-sm text-ink-400">Reels ainda não é suportado (sem pipeline de vídeo real).</p>
          )}
          {content.status === 'aprovado' && canAdmin && (
            <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ status: 'rascunho' })}>
              Voltar para rascunho
            </Button>
          )}

          {content.status === 'agendado' && canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={openReschedule} disabled={!!activePublication?.claimed_at}>
                Reagendar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelPublicationMutation.mutate()}
                disabled={cancelPublicationMutation.isPending || !!activePublication?.claimed_at}
              >
                Cancelar agendamento
              </Button>
              {activePublication?.claimed_at && (
                <p className="text-xs text-ink-400 self-center">Já em processamento — não pode mais cancelar/reagendar.</p>
              )}
            </>
          )}

          {content.status === 'falhou' && canEdit && (
            <>
              <Button size="sm" onClick={() => setPublishDialog('schedule')}>
                Tentar novamente
              </Button>
              <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ status: 'rascunho' })}>
                Voltar para rascunho
              </Button>
            </>
          )}

          {content.status === 'publicado' && (
            <p className="text-sm text-ink-400">Conteúdo publicado — status final.</p>
          )}
        </div>
      </div>

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[min(440px,92vw)] rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">Rejeitar conteúdo</h3>
            <p className="mt-1 text-sm text-ink-500">Explique o motivo para quem criou o conteúdo poder corrigir.</p>
            <Textarea
              className="mt-3"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex.: falta CTA, tom muito informal…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!rejectReason.trim() || transitionMutation.isPending}
                onClick={() => transitionMutation.mutate({ status: 'rejeitado', extra: { rejection_reason: rejectReason } })}
              >
                Rejeitar
              </Button>
            </div>
          </div>
        </div>
      )}

      {publishDialog && activeWorkspace && (
        <SchedulePublishDialog
          content={content}
          workspaceId={activeWorkspace.id}
          timezone={tz}
          publishNowMode={publishDialog === 'publish_now'}
          onClose={() => setPublishDialog(null)}
          onDone={() => {
            setPublishDialog(null)
            invalidate()
            queryClient.invalidateQueries({ queryKey: ['instagram-publication', id] })
          }}
        />
      )}

      {rescheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[min(440px,92vw)] rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">Reagendar publicação</h3>
            <p className="mt-1 text-sm text-ink-500">Horário no fuso do workspace ({tz}).</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rescheduleDate">Data</Label>
                <Input id="rescheduleDate" type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rescheduleTime">Horário</Label>
                <Input id="rescheduleTime" type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!rescheduleDate || !rescheduleTime || reschedulePublicationMutation.isPending}
                onClick={confirmReschedule}
              >
                Confirmar novo horário
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[min(420px,92vw)] rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">Excluir conteúdo?</h3>
            <p className="mt-1 text-sm text-ink-500">
              Status atual: {STATUS_LABEL[content.status]}. O conteúdo será movido para excluído; o histórico é preservado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
