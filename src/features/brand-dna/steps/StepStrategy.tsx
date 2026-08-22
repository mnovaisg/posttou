import type { BrandDnaDraft } from '@/features/brand-dna/state'
import { CONTENT_FORMATS, CONTENT_OBJECTIVES } from '@/features/brand-dna/types'
import type { ContentFormat, ContentObjective } from '@/features/brand-dna/types'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { cn } from '@/lib/utils'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function StepStrategy({
  draft,
  onChange,
}: {
  draft: BrandDnaDraft
  onChange: (patch: Partial<BrandDnaDraft>) => void
}) {
  const strategy = draft.contentStrategy

  function patch(p: Partial<BrandDnaDraft['contentStrategy']>) {
    onChange({ contentStrategy: { ...strategy, ...p } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Temas prioritários</Label>
          <TagInput value={strategy.priority_themes} onChange={(v) => patch({ priority_themes: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Temas secundários</Label>
          <TagInput value={strategy.secondary_themes} onChange={(v) => patch({ secondary_themes: v })} placeholder="Digite e pressione Enter" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Formatos preferidos</Label>
        <div className="flex flex-wrap gap-2">
          {CONTENT_FORMATS.map((f) => (
            <ToggleChip
              key={f.value}
              active={strategy.preferred_formats.includes(f.value)}
              label={f.label}
              onClick={() => patch({ preferred_formats: toggle<ContentFormat>(strategy.preferred_formats, f.value) })}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Objetivos do conteúdo</Label>
        <div className="flex flex-wrap gap-2">
          {CONTENT_OBJECTIVES.map((o) => (
            <ToggleChip
              key={o.value}
              active={strategy.objectives.includes(o.value)}
              label={o.label}
              onClick={() => patch({ objectives: toggle<ContentObjective>(strategy.objectives, o.value) })}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Assuntos que a marca gosta de abordar</Label>
          <TagInput value={strategy.topics_to_cover} onChange={(v) => patch({ topics_to_cover: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Assuntos que a marca NÃO quer abordar</Label>
          <TagInput value={strategy.topics_to_avoid} onChange={(v) => patch({ topics_to_avoid: v })} placeholder="Digite e pressione Enter" />
        </div>
      </div>
    </div>
  )
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
          : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
      )}
    >
      {label}
    </button>
  )
}
