import { Link } from 'react-router-dom'
import type { BrandDnaDraft } from '@/features/brand-dna/state'
import { useBrandAssetUrl } from '@/features/brand-dna/useBrandAssetUrl'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-ink-400">{label}</span>
      <span className="text-sm text-ink-700 dark:text-ink-200">{value}</span>
    </div>
  )
}

function SummaryTags({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="neutral">
            {v}
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function StepReview({ draft }: { draft: BrandDnaDraft }) {
  const { data: avatarUrl } = useBrandAssetUrl(draft.avatarPath)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={avatarUrl ?? undefined} alt={draft.companyName} />
          <AvatarFallback>{draft.companyName.slice(0, 2).toUpperCase() || 'PT'}</AvatarFallback>
        </Avatar>
        <div>
          <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{draft.companyName || 'Sua marca'}</h3>
          <p className="text-sm text-ink-500">{draft.segment || 'Segmento não informado'}</p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Sua marca</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SummaryRow label="Descrição" value={draft.description} />
          <SummaryRow label="Localização" value={draft.location} />
          <SummaryRow label="Diferenciais" value={draft.differentiators} />
          <SummaryRow label="Problemas que resolve" value={draft.problemsSolved} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Público</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SummaryTags label="Interesses" values={draft.audience.interests} />
          <SummaryTags label="Dores" values={draft.audience.pains} />
          <SummaryTags label="Desejos" values={draft.audience.desires} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Estratégia de conteúdo</h4>
        <SummaryTags label="Temas prioritários" values={draft.contentStrategy.priority_themes} />
        <SummaryTags label="Formatos preferidos" values={draft.contentStrategy.preferred_formats} />
        <SummaryTags label="Objetivos" values={draft.contentStrategy.objectives} />
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Voz e personalidade</h4>
        <SummaryTags label="Personalidade" values={draft.voice.personality_traits} />
        <SummaryTags label="Palavras preferidas" values={draft.vocabulary.preferred_words} />
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Identidade visual</h4>
        <SummaryTags label="Cores" values={draft.visualIdentity.colors} />
        <SummaryRow label="Estilo visual" value={draft.visualIdentity.visual_style} />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-ink-200 p-4 dark:border-ink-700">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Estilo da marca</h4>
        <p className="text-sm text-ink-500">
          Cores estruturadas, logo, estilo de imagem/design e a Biblioteca da Marca — o que guia a geração visual dos
          seus conteúdos.
        </p>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/dna-da-marca/estilo">Configurar estilo da marca</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-ink-200 p-4 dark:border-ink-700">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-50">DNA visual & referências</h4>
        <p className="text-sm text-ink-500">
          Defina 3 direções visuais reais para sua marca e adicione perfis de referência que representam a direção
          que você admira.
        </p>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/dna-da-marca/visual">Refinar meu DNA visual</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
