import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

const HEX_RE = /^#([0-9a-f]{6})$/i

function normalizeHex(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  placeholder: string
}) {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])

  const isValid = draft === '' || HEX_RE.test(normalizeHex(draft))

  function commit(next: string) {
    const normalized = normalizeHex(next)
    setDraft(normalized)
    if (normalized === '' || HEX_RE.test(normalized)) onChange(normalized)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_RE.test(normalizeHex(draft)) ? normalizeHex(draft) : '#cccccc'}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-ink-200 bg-transparent p-0.5 dark:border-ink-700"
          aria-label={`${label} (seletor visual)`}
        />
        <Input
          value={draft}
          onChange={(e) => commit(e.target.value)}
          placeholder={placeholder}
          className={!isValid ? 'border-danger-500 focus-visible:ring-danger-500' : undefined}
        />
      </div>
      {!isValid && <p className="text-xs text-danger-500">Use um hex válido, ex.: #6748FA.</p>}
    </div>
  )
}

export interface BrandColorsState {
  primary_color: string
  background_color: string
  text_color: string
}

export function BrandColors({
  value,
  onChange,
}: {
  value: BrandColorsState
  onChange: (patch: Partial<BrandColorsState>) => void
}) {
  const preview = {
    bg: value.background_color || '#ffffff',
    text: value.text_color || '#111827',
    primary: value.primary_color || '#6748fa',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ColorField
          label="Cor principal"
          value={value.primary_color}
          onChange={(hex) => onChange({ primary_color: hex })}
          placeholder="#6748FA"
        />
        <ColorField
          label="Cor de fundo"
          value={value.background_color}
          onChange={(hex) => onChange({ background_color: hex })}
          placeholder="#FFFFFF"
        />
        <ColorField
          label="Cor do texto"
          value={value.text_color}
          onChange={(hex) => onChange({ text_color: hex })}
          placeholder="#111827"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Preview</Label>
        <div
          className="flex flex-col gap-2 rounded-xl border border-ink-200 p-5 dark:border-ink-700"
          style={{ background: preview.bg, color: preview.text }}
        >
          <span className="text-xs font-medium uppercase tracking-wide opacity-70">Sua marca</span>
          <p className="text-lg font-semibold">Assim fica o contraste entre fundo e texto.</p>
          <button
            type="button"
            className="mt-1 self-start rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: preview.primary }}
          >
            Botão de exemplo
          </button>
        </div>
      </div>
    </div>
  )
}
