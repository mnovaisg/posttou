import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EditorPage } from '@/features/editor/types'

export function PagesPanel({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  disabled,
}: {
  pages: EditorPage[]
  activePageId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (id: string, direction: 'left' | 'right') => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto p-3">
      {pages.map((page, i) => {
        const ratio = page.height / page.width
        const isActive = page.id === activePageId
        return (
          <div key={page.id} className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              style={{ width: 64, height: 64 * ratio }}
              className={cn(
                'flex items-center justify-center rounded-md border-2 text-xs font-medium',
                isActive ? 'border-brand-500' : 'border-ink-200 dark:border-ink-700',
              )}
            >
              <div className="relative h-full w-full overflow-hidden rounded" style={{ background: page.background_color }}>
                <span className="absolute bottom-0.5 right-1 text-[10px] text-ink-400">{i + 1}</span>
              </div>
            </button>
            {isActive && pages.length > 1 && (
              <div className="flex gap-0.5">
                <button disabled={disabled || i === 0} onClick={() => onReorder(page.id, 'left')} className="text-xs text-ink-400 disabled:opacity-30">◀</button>
                <button disabled={disabled} onClick={() => onDuplicate(page.id)} className="text-xs text-ink-400" title="Duplicar">⧉</button>
                <button disabled={disabled || pages.length <= 1} onClick={() => onDelete(page.id)} className="text-xs text-danger-500 disabled:opacity-30" title="Excluir">✕</button>
                <button disabled={disabled || i === pages.length - 1} onClick={() => onReorder(page.id, 'right')} className="text-xs text-ink-400 disabled:opacity-30">▶</button>
              </div>
            )}
          </div>
        )
      })}
      {!disabled && (
        <Button size="sm" variant="outline" onClick={onAdd} className="shrink-0">
          + Página
        </Button>
      )}
    </div>
  )
}
