import * as React from 'react'
import { loadEditorPages, getContentAssetSignedUrl, uploadContentImage, snapshotContentVersion } from '@/features/editor/api'
import { exportPageToPng } from '@/features/editor/exportPng'
import type { EditorPage, ImageElementContent } from '@/features/editor/types'
import type { ContentRow } from '@/features/content/types'
import { composeInstagramCaption } from '@/features/instagram-publish/caption'
import { fetchInstagramAccounts } from '@/features/instagram/api'
import type { InstagramAccountRow } from '@/features/instagram/types'
import { publishNow as callPublishNow, schedulePublication } from '@/features/instagram-publish/api'
import { getDatePartsInTimeZone, zonedTimeToUtc, formatInTimeZone } from '@/lib/timezone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

type Stage = 'loading' | 'form' | 'rendering' | 'error'

export function SchedulePublishDialog({
  content,
  workspaceId,
  timezone,
  publishNowMode,
  onClose,
  onDone,
}: {
  content: ContentRow
  workspaceId: string
  timezone: string
  publishNowMode: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [stage, setStage] = React.useState<Stage>('loading')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState<EditorPage[]>([])
  const [accounts, setAccounts] = React.useState<InstagramAccountRow[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState('')
  const [scheduleDate, setScheduleDate] = React.useState('')
  const [scheduleTime, setScheduleTime] = React.useState('')
  const [progressLabel, setProgressLabel] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [loadedPages, loadedAccounts] = await Promise.all([
          loadEditorPages(content.id),
          fetchInstagramAccounts(workspaceId),
        ])
        if (cancelled) return
        setPages(loadedPages)
        setAccounts(loadedAccounts)
        if (loadedAccounts.length === 1) setSelectedAccountId(loadedAccounts[0].id)

        const now = new Date(Date.now() + 60 * 60 * 1000)
        const parts = getDatePartsInTimeZone(now.toISOString(), timezone)
        setScheduleDate(parts.date)
        setScheduleTime(parts.time)

        setStage(loadedAccounts.length === 0 ? 'error' : 'form')
        if (loadedAccounts.length === 0) setErrorMessage('Nenhuma conta do Instagram conectada e ativa neste workspace.')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Não foi possível carregar o conteúdo.')
        setStage('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [content.id, workspaceId, timezone])

  async function handleConfirm() {
    if (!selectedAccountId) {
      setErrorMessage('Escolha uma conta do Instagram.')
      return
    }
    let scheduledAtIso: string | undefined
    if (!publishNowMode) {
      if (!scheduleDate || !scheduleTime) {
        setErrorMessage('Escolha data e horário.')
        return
      }
      scheduledAtIso = zonedTimeToUtc(scheduleDate, scheduleTime, timezone).toISOString()
    }

    setErrorMessage(null)
    setStage('rendering')

    try {
      setProgressLabel('Resolvendo imagens…')
      const paths = new Set<string>()
      for (const page of pages) {
        for (const el of page.elements) {
          if (el.type === 'image') paths.add((el.content as ImageElementContent).path)
        }
      }
      const imageUrlEntries = await Promise.all([...paths].map(async (p) => [p, await getContentAssetSignedUrl(p)] as const))
      const imageUrls: Record<string, string> = {}
      for (const [p, url] of imageUrlEntries) if (url) imageUrls[p] = url

      setProgressLabel('Renderizando imagem final…')
      const renderedAssetPaths: string[] = []
      for (let i = 0; i < pages.length; i++) {
        const dataUrl = await exportPageToPng(pages[i], imageUrls)
        const file = dataUrlToFile(dataUrl, `pagina-${i + 1}.png`)
        const path = await uploadContentImage(workspaceId, content.id, file)
        renderedAssetPaths.push(path)
      }

      setProgressLabel('Salvando versão…')
      const contentVersionId = await snapshotContentVersion(content.id, pages)

      setProgressLabel(publishNowMode ? 'Publicando…' : 'Agendando…')
      if (publishNowMode) {
        await callPublishNow({ contentId: content.id, instagramAccountId: selectedAccountId, contentVersionId, renderedAssetPaths })
      } else {
        await schedulePublication({
          contentId: content.id,
          instagramAccountId: selectedAccountId,
          contentVersionId,
          renderedAssetPaths,
          scheduledAt: scheduledAtIso!,
        })
      }

      onDone()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Não foi possível concluir.')
      setStage('form')
    }
  }

  const previewCaption = composeInstagramCaption({ caption: content.caption, cta: content.cta, hashtags: content.hashtags })
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(520px,92vw)] max-h-[90vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">
          {publishNowMode ? 'Publicar agora' : 'Agendar publicação'}
        </h3>

        {stage === 'loading' && <p className="mt-4 text-sm text-ink-500">Carregando…</p>}

        {stage === 'error' && (
          <>
            <p className="mt-4 text-sm text-danger-500">{errorMessage}</p>
            <div className="mt-5 flex justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </>
        )}

        {stage === 'rendering' && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            <p className="text-sm text-ink-600 dark:text-ink-300">{progressLabel}</p>
          </div>
        )}

        {stage === 'form' && (
          <>
            {accounts.length > 1 && (
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="account">Publicar em</Label>
                <select
                  id="account"
                  className="h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!publishNowMode && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scheduleDate">Data</Label>
                  <Input id="scheduleDate" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scheduleTime">Horário</Label>
                  <Input id="scheduleTime" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm dark:border-ink-700 dark:bg-ink-800">
              <p className="font-medium text-ink-800 dark:text-ink-100">
                Será {publishNowMode ? 'publicado agora' : 'publicado'} em{' '}
                {selectedAccount ? `@${selectedAccount.username}` : '(escolha a conta)'}
              </p>
              {!publishNowMode && scheduleDate && scheduleTime && (
                <p className="mt-1 text-ink-600 dark:text-ink-300">
                  {formatInTimeZone(zonedTimeToUtc(scheduleDate, scheduleTime, timezone).toISOString(), timezone, {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  })}{' '}
                  ({timezone})
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-ink-600 dark:text-ink-300">{previewCaption || '(sem legenda)'}</p>
              <p className="mt-2 text-xs text-ink-400">{pages.length} página(s) — {content.type}</p>
            </div>

            {errorMessage && <p className="mt-3 text-sm text-danger-500">{errorMessage}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={!selectedAccountId}>
                Confirmar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
