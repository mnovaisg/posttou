import type { BrandDnaDraft } from '@/features/brand-dna/state'
import { PERSONALITY_TRAITS } from '@/features/brand-dna/types'
import type { UsageIntensity } from '@/features/brand-dna/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { SliderControl } from '@/features/brand-dna/components/SliderControl'
import { cn } from '@/lib/utils'

const INTENSITIES: { value: UsageIntensity; label: string }[] = [
  { value: 'nenhum', label: 'Nenhum' },
  { value: 'pouco', label: 'Pouco' },
  { value: 'moderado', label: 'Moderado' },
  { value: 'muito', label: 'Muito' },
]

export function StepVoice({
  draft,
  onChange,
}: {
  draft: BrandDnaDraft
  onChange: (patch: Partial<BrandDnaDraft>) => void
}) {
  const voice = draft.voice
  const vocabulary = draft.vocabulary

  function patchVoice(p: Partial<BrandDnaDraft['voice']>) {
    onChange({ voice: { ...voice, ...p } })
  }
  function patchVocabulary(p: Partial<BrandDnaDraft['vocabulary']>) {
    onChange({ vocabulary: { ...vocabulary, ...p } })
  }
  function toggleTrait(trait: string) {
    patchVoice({
      personality_traits: voice.personality_traits.includes(trait)
        ? voice.personality_traits.filter((t) => t !== trait)
        : [...voice.personality_traits, trait],
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SliderControl
          label="Formalidade"
          leftLabel="Formal"
          rightLabel="Casual"
          value={voice.formality}
          onChange={(v) => patchVoice({ formality: v })}
        />
        <SliderControl
          label="Tom"
          leftLabel="Sério"
          rightLabel="Divertido"
          value={voice.tone}
          onChange={(v) => patchVoice({ tone: v })}
        />
        <SliderControl
          label="Complexidade"
          leftLabel="Técnico"
          rightLabel="Simples"
          value={voice.complexity}
          onChange={(v) => patchVoice({ complexity: v })}
        />
        <SliderControl
          label="Proximidade"
          leftLabel="Institucional"
          rightLabel="Pessoal"
          value={voice.personal_institutional}
          onChange={(v) => patchVoice({ personal_institutional: v })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Personalidade da marca</Label>
        <div className="flex flex-wrap gap-2">
          {PERSONALITY_TRAITS.map((trait) => (
            <button
              key={trait}
              type="button"
              onClick={() => toggleTrait(trait)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                voice.personality_traits.includes(trait)
                  ? 'border-brand-600 bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              {trait}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Palavras que devemos usar</Label>
          <TagInput
            value={vocabulary.preferred_words}
            onChange={(v) => patchVocabulary({ preferred_words: v })}
            placeholder="Digite e pressione Enter"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Palavras que NÃO devemos usar</Label>
          <TagInput
            value={vocabulary.forbidden_words}
            onChange={(v) => patchVocabulary({ forbidden_words: v })}
            placeholder="Digite e pressione Enter"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Expressões características da marca</Label>
          <TagInput
            value={vocabulary.signature_expressions}
            onChange={(v) => patchVocabulary({ signature_expressions: v })}
            placeholder="Digite e pressione Enter"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preferredCta">CTA preferido</Label>
          <Input
            id="preferredCta"
            value={vocabulary.preferred_cta}
            onChange={(e) => patchVocabulary({ preferred_cta: e.target.value })}
            placeholder="Ex.: Manda um DM pra gente!"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Uso de emojis</Label>
          <div className="flex flex-wrap gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                type="button"
                onClick={() => patchVocabulary({ emoji_usage: i.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  vocabulary.emoji_usage === i.value
                    ? 'border-brand-600 bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Uso de hashtags</Label>
          <div className="flex flex-wrap gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                type="button"
                onClick={() => patchVocabulary({ hashtag_usage: i.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  vocabulary.hashtag_usage === i.value
                    ? 'border-brand-600 bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hashtagStyle">Estilo de hashtags</Label>
        <Input
          id="hashtagStyle"
          value={vocabulary.hashtag_style}
          onChange={(e) => patchVocabulary({ hashtag_style: e.target.value })}
          placeholder="Ex.: sempre em português, focadas no nicho"
        />
      </div>
    </div>
  )
}
