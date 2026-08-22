import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EditorElement } from '@/features/editor/types'

const TYPE_ICON = { text: '🔤', image: '🖼️', shape: '⬛' } as const

export function LayersPanel({
  elements,
  selectedId,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onReorder,
  disabled,
}: {
  elements: EditorElement[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleHidden: (id: string) => void
  onToggleLocked: (id: string) => void
  onReorder: (id: string, direction: 'front' | 'back' | 'forward' | 'backward') => void
  disabled: boolean
}) {
  const ordered = [...elements].sort((a, b) => b.z_index - a.z_index)

  return (
    <div className="flex flex-col gap-1 p-3">
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Camadas</h3>
      {ordered.length === 0 && <p className="px-1 text-sm text-ink-400">Nenhum elemento nesta página.</p>}
      {ordered.map((el) => (
        <div
          key={el.id}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
            selectedId === el.id ? 'bg-brand-100 dark:bg-brand-950' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
          )}
        >
          <button type="button" className="flex-1 truncate text-left" onClick={() => onSelect(el.id)}>
            {TYPE_ICON[el.type]} {elementLabel(el)}
          </button>
          <button type="button" disabled={disabled} onClick={() => onToggleHidden(el.id)} title="Ocultar/mostrar" className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100">
            {el.hidden ? '🚫' : '👁'}
          </button>
          <button type="button" disabled={disabled} onClick={() => onToggleLocked(el.id)} title="Bloquear/desbloquear" className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100">
            {el.locked ? '🔒' : '🔓'}
          </button>
        </div>
      ))}

      {selectedId && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-200 pt-2 dark:border-ink-700">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onReorder(selectedId, 'front')}>Frente</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onReorder(selectedId, 'forward')}>Avançar</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onReorder(selectedId, 'backward')}>Recuar</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onReorder(selectedId, 'back')}>Trás</Button>
        </div>
      )}
    </div>
  )
}

function elementLabel(el: EditorElement): string {
  if (el.type === 'text') return (el.content as { text: string }).text.slice(0, 24) || 'Texto vazio'
  if (el.type === 'image') return 'Imagem'
  return `Forma (${(el.content as { shapeKind: string }).shapeKind})`
}
