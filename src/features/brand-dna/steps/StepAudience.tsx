import type { BrandDnaDraft } from '@/features/brand-dna/state'
import type { KnowledgeLevel } from '@/features/brand-dna/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { cn } from '@/lib/utils'

const KNOWLEDGE_LEVELS: { value: KnowledgeLevel; label: string }[] = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
]

export function StepAudience({
  draft,
  onChange,
}: {
  draft: BrandDnaDraft
  onChange: (patch: Partial<BrandDnaDraft>) => void
}) {
  const audience = draft.audience

  function patchAudience(patch: Partial<BrandDnaDraft['audience']>) {
    onChange({ audience: { ...audience, ...patch } })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ageRange">Faixa etária</Label>
          <Input id="ageRange" value={audience.age_range} onChange={(e) => patchAudience({ age_range: e.target.value })} placeholder="Ex.: 25-40 anos" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gender">Gênero (quando relevante)</Label>
          <Input id="gender" value={audience.gender} onChange={(e) => patchAudience({ gender: e.target.value })} placeholder="Ex.: predominantemente feminino" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audienceLocation">Localização do público</Label>
          <Input
            id="audienceLocation"
            value={audience.location}
            onChange={(e) => patchAudience({ location: e.target.value })}
            placeholder="Ex.: Grandes centros urbanos"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Interesses</Label>
          <TagInput value={audience.interests} onChange={(v) => patchAudience({ interests: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Necessidades</Label>
          <TagInput value={audience.needs} onChange={(v) => patchAudience({ needs: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Dores</Label>
          <TagInput value={audience.pains} onChange={(v) => patchAudience({ pains: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Desejos</Label>
          <TagInput value={audience.desires} onChange={(v) => patchAudience({ desires: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Objeções comuns</Label>
          <TagInput value={audience.objections} onChange={(v) => patchAudience({ objections: v })} placeholder="Ex.: 'é caro', 'não tenho tempo'" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buyingBehavior">Comportamento de compra</Label>
        <Textarea
          id="buyingBehavior"
          value={audience.buying_behavior}
          onChange={(e) => patchAudience({ buying_behavior: e.target.value })}
          rows={2}
          placeholder="Como essa pessoa decide comprar? Pesquisa muito? Compra por impulso?"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Nível de conhecimento sobre o produto/serviço</Label>
        <div className="flex flex-wrap gap-2">
          {KNOWLEDGE_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => patchAudience({ knowledge_level: level.value })}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                audience.knowledge_level === level.value
                  ? 'border-brand-600 bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
