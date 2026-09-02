import type * as React from 'react'
import { cn } from '@/lib/utils'

export function StyleCardPicker<T extends string>({
  options,
  value,
  onChange,
  renderPreview,
}: {
  options: { value: T; label: string; description: string }[]
  value: T | ''
  onChange: (value: T) => void
  renderPreview: (value: T) => React.ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors',
              selected
                ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950'
                : 'border-ink-200 hover:border-brand-300 dark:border-ink-700 dark:hover:border-brand-700',
            )}
          >
            {renderPreview(opt.value)}
            <div>
              <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{opt.label}</p>
              <p className="text-xs text-ink-500">{opt.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
