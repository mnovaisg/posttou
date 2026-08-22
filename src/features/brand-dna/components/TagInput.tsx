import * as React from 'react'
import { cn } from '@/lib/utils'

export function TagInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = React.useState('')

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 dark:border-ink-700 dark:bg-ink-900',
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-brand-600 hover:text-brand-900 dark:text-brand-300"
            aria-label={`Remover ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-ink-400"
      />
    </div>
  )
}
