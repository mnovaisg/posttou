import * as React from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RadarTargetRow } from '@/features/radar/config-api'
import { SUGGESTION_PAGE_SIZE } from '@/features/radar/suggestions'

const LIMIT = 5

export function RadarTargetGroup({
  title,
  description,
  prefix,
  selected,
  suggestionPool,
  emptySuggestionsMessage,
  canWrite,
  busy,
  onAdd,
  onRemove,
  manualPlaceholder,
}: {
  title: string
  description: string
  /** '#' para hashtag, '@' para concorrente, '' para termo — só apresentação, nunca gravado. */
  prefix: '' | '#' | '@'
  selected: RadarTargetRow[]
  /** Pool completo de sugestões (já sem as já selecionadas) — "Sugerir mais" só avança a página dentro deste array. */
  suggestionPool: string[]
  emptySuggestionsMessage?: string
  canWrite: boolean
  busy: boolean
  onAdd: (value: string, source: 'manual' | 'sugestao_dna') => void
  onRemove: (id: string) => void
  manualPlaceholder: string
}) {
  const [page, setPage] = React.useState(0)
  const [manualValue, setManualValue] = React.useState('')

  const selectedValues = new Set(selected.map((s) => s.value))
  const visiblePool = suggestionPool.filter((s) => !selectedValues.has(s.toLowerCase()))
  const pageItems = visiblePool.slice(0, (page + 1) * SUGGESTION_PAGE_SIZE)
  const hasMore = pageItems.length < visiblePool.length

  const atLimit = selected.length >= LIMIT

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualValue.trim() || atLimit) return
    onAdd(manualValue, 'manual')
    setManualValue('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
          <p className="text-sm text-ink-500">{description}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
            atLimit ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
          )}
        >
          {selected.length}/{LIMIT}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <span
              key={item.id}
              className="flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200"
            >
              {prefix}
              {item.value}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={busy}
                  className="text-brand-600 hover:text-brand-900 disabled:opacity-50 dark:text-brand-300"
                  aria-label={`Remover ${item.value}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canWrite && !atLimit && (
        <>
          {pageItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pageItems.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onAdd(s, 'sugestao_dna')}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-sm text-ink-600 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 dark:border-ink-600 dark:text-ink-300 dark:hover:border-brand-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {prefix}
                  {s}
                </button>
              ))}
            </div>
          ) : (
            emptySuggestionsMessage && <p className="text-xs text-ink-400">{emptySuggestionsMessage}</p>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="self-start text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Sugerir mais
            </button>
          )}

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder={manualPlaceholder}
              className="max-w-xs"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!manualValue.trim() || busy}>
              Adicionar
            </Button>
          </form>
        </>
      )}

      {atLimit && canWrite && <p className="text-xs text-ink-400">Limite atingido — remova um item para adicionar outro.</p>}
    </div>
  )
}
