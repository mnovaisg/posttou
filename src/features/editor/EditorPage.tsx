import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Button } from '@/components/ui/button'
import {
  getContent,
  getContentAssetSignedUrl,
  loadEditorPages,
  logEditorAudit,
  saveEditorPages,
  snapshotContentVersion,
  uploadContentImage,
} from '@/features/editor/api'
import { fetchOperationCosts } from '@/features/ai-generate/api'
import { useEditorHistory } from '@/features/editor/useEditorHistory'
import { Canvas } from '@/features/editor/components/Canvas'
import { PropertiesPanel } from '@/features/editor/components/PropertiesPanel'
import { LayersPanel } from '@/features/editor/components/LayersPanel'
import { PagesPanel } from '@/features/editor/components/PagesPanel'
import { Toolbar } from '@/features/editor/components/Toolbar'
import { GenerateImageDialog } from '@/features/editor/components/GenerateImageDialog'
import { PreviewMode } from '@/features/editor/components/PreviewMode'
import { exportPageToPng, downloadDataUrl } from '@/features/editor/exportPng'
import {
  DEFAULT_IMAGE_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
} from '@/features/editor/types'
import type { EditorElement, EditorPage as EditorPageModel, ImageElementContent, ShapeKind } from '@/features/editor/types'

const AUTOSAVE_DEBOUNCE_MS = 4000

function newElementId() {
  return `local-${crypto.randomUUID()}`
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { activeWorkspace, hasRole } = useWorkspace()
  const canEdit = hasRole(['owner', 'admin', 'editor'])

  const { data: content } = useQuery({ queryKey: ['content', id], enabled: !!id, queryFn: () => getContent(id!) })
  const { data: initialPages, isLoading } = useQuery({
    queryKey: ['editor-pages', id],
    enabled: !!id,
    queryFn: () => loadEditorPages(id!),
  })
  const { data: operationCosts } = useQuery({ queryKey: ['ai-operation-costs'], queryFn: fetchOperationCosts })

  const { pages, commit, undo, redo, resetHistory, canUndo, canRedo } = useEditorHistory([])
  const [activePageId, setActivePageId] = React.useState<string>('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState(0.4)
  const [imageUrls, setImageUrls] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [showGenerateDialog, setShowGenerateDialog] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)
  const [clipboard, setClipboard] = React.useState<EditorElement | null>(null)
  const [mobilePanel, setMobilePanel] = React.useState<'none' | 'tools' | 'properties'>('none')

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = React.useState({ width: 800, height: 600 })
  const loadedRef = React.useRef(false)

  React.useEffect(() => {
    if (initialPages && !loadedRef.current) {
      resetHistory(initialPages)
      setActivePageId(initialPages[0]?.id ?? '')
      loadedRef.current = true
    }
  }, [initialPages, resetHistory])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0]

  // Resolve URLs assinadas de todas as imagens usadas (todas as páginas).
  React.useEffect(() => {
    const paths = new Set<string>()
    for (const page of pages) {
      for (const el of page.elements) {
        if (el.type === 'image') paths.add((el.content as ImageElementContent).path)
      }
    }
    const missing = [...paths].filter((p) => !imageUrls[p])
    if (!missing.length) return
    let cancelled = false
    Promise.all(missing.map(async (p) => [p, await getContentAssetSignedUrl(p)] as const)).then((entries) => {
      if (cancelled) return
      setImageUrls((prev) => {
        const next = { ...prev }
        for (const [p, url] of entries) if (url) next[p] = url
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages])

  function updatePages(mutator: (pages: EditorPageModel[]) => EditorPageModel[], { toHistory = true }: { toHistory?: boolean } = {}) {
    const next = mutator(pages)
    if (toHistory) commit(next)
    setDirty(true)
  }

  function updateElement(pageId: string, elementId: string, patch: Partial<EditorElement>, toHistory: boolean) {
    updatePages(
      (prev) =>
        prev.map((p) =>
          p.id !== pageId
            ? p
            : { ...p, elements: p.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el)) },
        ),
      { toHistory },
    )
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saved = await saveEditorPages({ contentId: id!, pages })
      await snapshotContentVersion(id!, saved)
      await logEditorAudit(activeWorkspace!.id, 'editor_salvo', id!, { page_count: saved.length })
      return saved
    },
    onMutate: () => {
      setSaving(true)
      setSaveError(null)
    },
    onSuccess: (saved) => {
      resetHistory(saved)
      setDirty(false)
      setSaving(false)
      queryClient.invalidateQueries({ queryKey: ['content-pages', id] })
    },
    onError: (e) => {
      setSaving(false)
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    },
  })

  // Autosave com debounce — nunca salva a cada alteração, só X ms depois
  // da última mudança, e nunca durante um save em andamento.
  React.useEffect(() => {
    if (!dirty || !canEdit || saveMutation.isPending) return
    const timer = setTimeout(() => saveMutation.mutate(), AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, pages])

  // Atalhos de teclado.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!canEdit) return
      const meta = e.metaKey || e.ctrlKey
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (isTyping) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeElement(selectedId)
      } else if (meta && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (meta && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateElement(selectedId)
      } else if (meta && e.key.toLowerCase() === 'c' && selectedId) {
        const el = activePage?.elements.find((el2) => el2.id === selectedId)
        if (el) setClipboard(el)
      } else if (meta && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault()
        pasteElement()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, clipboard, activePage, canEdit])

  function nextZIndex(page: EditorPageModel) {
    return page.elements.length ? Math.max(...page.elements.map((e) => e.z_index)) + 1 : 0
  }

  function addElement(base: Omit<EditorElement, 'id' | 'page_id' | 'z_index' | 'isNew'>) {
    if (!activePage) return
    const el: EditorElement = { ...base, id: newElementId(), page_id: activePage.id, z_index: nextZIndex(activePage), isNew: true }
    updatePages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, elements: [...p.elements, el] } : p)))
    setSelectedId(el.id)
    logEditorAudit(activeWorkspace!.id, 'editor_elemento_criado', id!, { type: el.type })
  }

  function addText() {
    addElement({
      type: 'text',
      position_x: 100,
      position_y: 100,
      width: 400,
      height: 100,
      rotation: 0,
      locked: false,
      hidden: false,
      content: { text: 'Novo texto' },
      style: { ...DEFAULT_TEXT_STYLE },
    })
  }

  function addShape(kind: ShapeKind) {
    addElement({
      type: 'shape',
      position_x: 150,
      position_y: 150,
      width: 200,
      height: 200,
      rotation: 0,
      locked: false,
      hidden: false,
      content: { shapeKind: kind },
      style: { ...DEFAULT_SHAPE_STYLE },
    })
  }

  async function handleUpload(file: File) {
    if (!activePage || !activeWorkspace) return
    try {
      const path = await uploadContentImage(activeWorkspace.id, id!, file)
      const url = await getContentAssetSignedUrl(path)
      if (url) setImageUrls((prev) => ({ ...prev, [path]: url }))
      addElement({
        type: 'image',
        position_x: 60,
        position_y: 60,
        width: Math.min(activePage.width - 120, 600),
        height: Math.min(activePage.height - 120, 600),
        rotation: 0,
        locked: false,
        hidden: false,
        content: { path },
        style: { ...DEFAULT_IMAGE_STYLE },
      })
      logEditorAudit(activeWorkspace.id, 'editor_upload_imagem', id!, {})
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Falha no upload.')
    }
  }

  function handleGeneratedImage(assetPath: string) {
    getContentAssetSignedUrl(assetPath).then((url) => {
      if (url) setImageUrls((prev) => ({ ...prev, [assetPath]: url }))
    })
    if (!activePage) return
    addElement({
      type: 'image',
      position_x: 60,
      position_y: 60,
      width: Math.min(activePage.width - 120, 600),
      height: Math.min(activePage.height - 120, 600),
      rotation: 0,
      locked: false,
      hidden: false,
      content: { path: assetPath },
      style: { ...DEFAULT_IMAGE_STYLE },
    })
  }

  function removeElement(elementId: string) {
    if (!activePage) return
    updatePages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, elements: p.elements.filter((el) => el.id !== elementId) } : p)))
    setSelectedId(null)
    logEditorAudit(activeWorkspace!.id, 'editor_elemento_excluido', id!, {})
  }

  function duplicateElement(elementId: string) {
    if (!activePage) return
    const el = activePage.elements.find((e) => e.id === elementId)
    if (!el) return
    const copy: EditorElement = { ...el, id: newElementId(), position_x: el.position_x + 24, position_y: el.position_y + 24, z_index: nextZIndex(activePage), isNew: true }
    updatePages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, elements: [...p.elements, copy] } : p)))
    setSelectedId(copy.id)
  }

  function pasteElement() {
    if (!activePage || !clipboard) return
    const copy: EditorElement = { ...clipboard, id: newElementId(), position_x: clipboard.position_x + 24, position_y: clipboard.position_y + 24, z_index: nextZIndex(activePage), isNew: true }
    updatePages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, elements: [...p.elements, copy] } : p)))
    setSelectedId(copy.id)
  }

  function toggleHidden(elementId: string) {
    if (!activePage) return
    const el = activePage.elements.find((e) => e.id === elementId)
    if (el) updateElement(activePage.id, elementId, { hidden: !el.hidden }, true)
  }
  function toggleLocked(elementId: string) {
    if (!activePage) return
    const el = activePage.elements.find((e) => e.id === elementId)
    if (el) updateElement(activePage.id, elementId, { locked: !el.locked }, true)
  }

  function reorderLayer(elementId: string, direction: 'front' | 'back' | 'forward' | 'backward') {
    if (!activePage) return
    const sorted = [...activePage.elements].sort((a, b) => a.z_index - b.z_index)
    const idx = sorted.findIndex((e) => e.id === elementId)
    if (idx === -1) return
    if (direction === 'front') sorted.push(...sorted.splice(idx, 1))
    else if (direction === 'back') sorted.unshift(...sorted.splice(idx, 1))
    else if (direction === 'forward' && idx < sorted.length - 1) [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]]
    else if (direction === 'backward' && idx > 0) [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]]

    const reindexed = sorted.map((el, i) => ({ ...el, z_index: i }))
    updatePages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, elements: reindexed } : p)))
  }

  function addPage() {
    if (!activePage) return
    const newPage: EditorPageModel = {
      id: newElementId(),
      content_id: id!,
      position: pages.length,
      background_color: '#ffffff',
      width: activePage.width,
      height: activePage.height,
      elements: [],
      isNew: true,
    }
    updatePages((prev) => [...prev, newPage])
    setActivePageId(newPage.id)
    logEditorAudit(activeWorkspace!.id, 'editor_pagina_adicionada', id!, {})
  }

  function duplicatePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    const newPage: EditorPageModel = {
      ...page,
      id: newElementId(),
      isNew: true,
      position: pages.length,
      elements: page.elements.map((el) => ({ ...el, id: newElementId(), isNew: true })),
    }
    updatePages((prev) => [...prev, newPage])
    setActivePageId(newPage.id)
  }

  function deletePage(pageId: string) {
    if (pages.length <= 1) return
    updatePages((prev) => prev.filter((p) => p.id !== pageId).map((p, i) => ({ ...p, position: i })))
    if (activePageId === pageId) setActivePageId(pages.find((p) => p.id !== pageId)?.id ?? '')
    logEditorAudit(activeWorkspace!.id, 'editor_pagina_removida', id!, {})
  }

  function reorderPage(pageId: string, direction: 'left' | 'right') {
    const idx = pages.findIndex((p) => p.id === pageId)
    if (idx === -1) return
    const swapWith = direction === 'left' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= pages.length) return
    const next = [...pages]
    ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
    updatePages(() => next.map((p, i) => ({ ...p, position: i })))
  }

  async function handleExportPage() {
    if (!activePage) return
    const dataUrl = await exportPageToPng(activePage, imageUrls)
    downloadDataUrl(dataUrl, `${content?.title ?? 'conteudo'}-pagina-${activePage.position + 1}.png`)
    logEditorAudit(activeWorkspace!.id, 'editor_exportacao', id!, { page_id: activePage.id })
  }

  async function handleExportAll() {
    for (const page of pages) {
      const dataUrl = await exportPageToPng(page, imageUrls)
      downloadDataUrl(dataUrl, `${content?.title ?? 'conteudo'}-pagina-${page.position + 1}.png`)
    }
    logEditorAudit(activeWorkspace!.id, 'editor_exportacao', id!, { all_pages: true, count: pages.length })
  }

  const selectedElement = activePage?.elements.find((el) => el.id === selectedId) ?? null

  if (isLoading || !activePage) {
    return <div className="p-6 text-sm text-ink-400">Carregando editor…</div>
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-50 dark:bg-ink-950">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 bg-white px-4 dark:border-ink-700 dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <Link to={`/conteudo/${id}`} className="text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">← Voltar</Link>
          <span className="text-sm font-medium text-ink-900 dark:text-ink-50">{content?.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={!canUndo} onClick={undo}>↶ Desfazer</Button>
          <Button size="sm" variant="ghost" disabled={!canRedo} onClick={redo}>↷ Refazer</Button>
          <Button size="sm" variant="outline" onClick={() => setShowPreview(true)}>Visualizar</Button>
          <Button size="sm" variant="outline" onClick={handleExportPage}>Exportar PNG</Button>
          {pages.length > 1 && <Button size="sm" variant="outline" onClick={handleExportAll}>Exportar tudo</Button>}
          {canEdit && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saving || !dirty}>
              {saving ? 'Salvando…' : dirty ? 'Salvar' : 'Salvo'}
            </Button>
          )}
        </div>
      </div>

      {saveError && <p className="bg-red-50 px-4 py-1 text-xs text-danger-500 dark:bg-red-950">{saveError}</p>}
      {!canEdit && <p className="bg-amber-50 px-4 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">Você tem acesso somente leitura a este conteúdo.</p>}

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-48 shrink-0 overflow-y-auto border-r border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900 lg:block">
          <Toolbar
            disabled={!canEdit}
            onAddText={addText}
            onAddShape={addShape}
            onUploadClick={handleUpload}
            onGenerateImage={() => setShowGenerateDialog(true)}
          />
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-center gap-2 border-b border-ink-200 bg-white py-1.5 dark:border-ink-700 dark:bg-ink-900">
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}>−</Button>
            <span className="w-12 text-center text-xs text-ink-500">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom(Math.min((containerSize.width - 80) / activePage.width, (containerSize.height - 80) / activePage.height))}
            >
              Ajustar
            </Button>
          </div>

          <div ref={containerRef} className="flex-1 overflow-hidden bg-ink-100 dark:bg-ink-950">
            <Canvas
              page={activePage}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChangeLive={(elId, patch) => updateElement(activePage.id, elId, patch, false)}
              onCommit={(elId, patch) => updateElement(activePage.id, elId, patch, true)}
              onEditText={() => {}}
              imageUrls={imageUrls}
              zoom={zoom}
              containerSize={containerSize}
            />
          </div>

          <div className="shrink-0 border-t border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900">
            <PagesPanel
              pages={pages}
              activePageId={activePage.id}
              onSelect={setActivePageId}
              onAdd={addPage}
              onDuplicate={duplicatePage}
              onDelete={deletePage}
              onReorder={reorderPage}
              disabled={!canEdit}
            />
          </div>
        </div>

        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900 lg:block">
          <PropertiesPanel element={selectedElement} onChange={(patch) => selectedId && updateElement(activePage.id, selectedId, patch, true)} disabled={!canEdit} />
          <LayersPanel
            elements={activePage.elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleHidden={toggleHidden}
            onToggleLocked={toggleLocked}
            onReorder={reorderLayer}
            disabled={!canEdit}
          />
        </aside>
      </div>

      {/* Barra inferior mobile — ferramentas e propriedades viram drawers, não é a UI desktop encolhida. */}
      <div className="flex shrink-0 items-center justify-around border-t border-ink-200 bg-white py-2 lg:hidden dark:border-ink-700 dark:bg-ink-900">
        <button type="button" className="text-sm text-ink-600 dark:text-ink-300" onClick={() => setMobilePanel('tools')}>🧰 Ferramentas</button>
        <button type="button" className="text-sm text-ink-600 dark:text-ink-300" onClick={() => setMobilePanel('properties')}>🎛️ Propriedades</button>
      </div>

      {mobilePanel !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" onClick={() => setMobilePanel('none')}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-white dark:bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-200 p-3 dark:border-ink-700">
              <span className="text-sm font-medium text-ink-900 dark:text-ink-50">
                {mobilePanel === 'tools' ? 'Ferramentas' : 'Propriedades e camadas'}
              </span>
              <button type="button" onClick={() => setMobilePanel('none')} className="text-ink-400">×</button>
            </div>
            {mobilePanel === 'tools' ? (
              <Toolbar
                disabled={!canEdit}
                onAddText={() => {
                  addText()
                  setMobilePanel('none')
                }}
                onAddShape={(kind) => {
                  addShape(kind)
                  setMobilePanel('none')
                }}
                onUploadClick={(file) => {
                  handleUpload(file)
                  setMobilePanel('none')
                }}
                onGenerateImage={() => {
                  setShowGenerateDialog(true)
                  setMobilePanel('none')
                }}
              />
            ) : (
              <>
                <PropertiesPanel element={selectedElement} onChange={(patch) => selectedId && updateElement(activePage.id, selectedId, patch, true)} disabled={!canEdit} />
                <LayersPanel
                  elements={activePage.elements}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggleHidden={toggleHidden}
                  onToggleLocked={toggleLocked}
                  onReorder={reorderLayer}
                  disabled={!canEdit}
                />
              </>
            )}
          </div>
        </div>
      )}

      {activeWorkspace && (
        <GenerateImageDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          workspaceId={activeWorkspace.id}
          contentId={id!}
          format={content?.format ?? '1:1'}
          creditCost={operationCosts?.imagem ?? null}
          onGenerated={handleGeneratedImage}
        />
      )}

      {showPreview && <PreviewMode pages={pages} imageUrls={imageUrls} onClose={() => setShowPreview(false)} />}
    </div>
  )
}
