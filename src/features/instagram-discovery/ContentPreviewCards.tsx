import * as React from 'react'
import { PosttouMark } from '@/components/brand/PosttouMark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DnaReviewState } from '@/features/instagram-discovery/DnaReviewCards'
import type { DiscoveryIdea } from '@/features/instagram-discovery/types'

export type PreviewObjective = 'descoberta' | 'autoridade' | 'conversao'

export interface ContentPreview {
  objective: PreviewObjective
  title: string
  support: string
  format: 'post' | 'carrossel' | 'reel'
  /** Índice da ideia real da IA que originou este preview — null quando
   * sintetizado a partir do DNA (nenhuma ideia da IA cobria esse
   * objetivo). Guardado para permitir, no claim (bloco futuro), ligar o
   * preview de volta à ideia original sem precisar redesenhar isto. */
  sourceIdeaIndex: number | null
}

const OBJECTIVE_META: Record<PreviewObjective, { label: string; hint: string }> = {
  descoberta: { label: 'Descoberta', hint: 'Alcançar pessoas novas' },
  autoridade: { label: 'Autoridade', hint: 'Mostrar conhecimento' },
  conversao: { label: 'Conversão', hint: 'Aproximar para uma ação' },
}

const FORMAT_LABEL: Record<ContentPreview['format'], string> = {
  post: 'Post',
  carrossel: 'Carrossel',
  reel: 'Reel',
}

function matchIdeaObjective(idea: DiscoveryIdea): PreviewObjective | null {
  const text = `${idea.objetivo ?? ''} ${idea.pilar ?? ''}`.toLowerCase()
  if (/(vend|convers|lead|a[cç][aã]o|agend|compr)/.test(text)) return 'conversao'
  if (/(autorid|educ|conhec|ensin|relacion)/.test(text)) return 'autoridade'
  if (/(alcance|descobert|engaj|viral)/.test(text)) return 'descoberta'
  return null
}

function firstNonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }
  return ''
}

/**
 * Preview sintetizado quando nenhuma ideia real da IA cobre esse
 * objetivo (DNA muito parcial, ou perfil com poucas ideias retornadas).
 * Usa só o que o usuário revisou no DNA — nunca inventa um insight que
 * pareça vindo de análise, deixa claro que é um ponto de partida.
 */
function fallbackPreview(objective: PreviewObjective, dna: DnaReviewState, format: ContentPreview['format']): ContentPreview {
  const name = firstNonEmpty(dna.name, 'sua marca')
  const theme = dna.themes[0]
  const objectiveText = dna.objectives[0]

  const titleByObjective: Record<PreviewObjective, string> = {
    descoberta: theme ? `Conheça a ${name}: ${theme}` : `Conheça a ${name}`,
    autoridade: theme ? `O que guia a ${name} em ${theme}` : `Por dentro da ${name}`,
    conversao: objectiveText ? `Pronto para ${objectiveText.toLowerCase()}?` : `Fale com a ${name}`,
  }

  const supportByObjective: Record<PreviewObjective, string> = {
    descoberta: dna.description || 'Uma primeira apresentação para quem ainda não te conhece.',
    autoridade: dna.tone ? `Tom ${dna.tone.toLowerCase()}, direto ao ponto.` : 'Mostrando como sua marca pensa.',
    conversao: 'Um convite claro para dar o próximo passo.',
  }

  return {
    objective,
    title: titleByObjective[objective],
    support: supportByObjective[objective],
    format,
    sourceIdeaIndex: null,
  }
}

/**
 * Monta exatamente 3 previews, um por objetivo, priorizando ideias reais
 * já geradas pela IA (mesmo lote sem custo adicional retornado por
 * instagram-discovery-public-start — nenhuma chamada nova é feita aqui).
 * Quando uma ideia real não cobre um objetivo, sintetiza a partir do DNA
 * revisado (nunca do DNA original não editado).
 */
export function buildContentPreviews(ideas: DiscoveryIdea[], dna: DnaReviewState): ContentPreview[] {
  const order: PreviewObjective[] = ['descoberta', 'autoridade', 'conversao']
  const fallbackFormats: ContentPreview['format'][] = ['post', 'carrossel', 'reel']
  const usedIdeaIndexes = new Set<number>()

  return order.map((objective, i) => {
    const matchIndex = ideas.findIndex((idea, idx) => !usedIdeaIndexes.has(idx) && matchIdeaObjective(idea) === objective)
    if (matchIndex !== -1) {
      usedIdeaIndexes.add(matchIndex)
      const idea = ideas[matchIndex]
      return {
        objective,
        title: firstNonEmpty(idea.titulo, idea.gancho),
        support: firstNonEmpty(idea.gancho !== idea.titulo ? idea.gancho : '', idea.resumo),
        format: idea.formato,
        sourceIdeaIndex: matchIndex,
      }
    }
    return fallbackPreview(objective, dna, fallbackFormats[i])
  })
}

// Nomes de cor em português comuns o bastante para aparecer no campo
// livre "Cores" do DNA — nunca tenta adivinhar tons não mapeados, só
// ignora silenciosamente (cai no gradiente padrão da marca).
const COLOR_WORD_MAP: Record<string, string> = {
  roxo: '#7c3aed',
  violeta: '#7c3aed',
  lilas: '#a78bfa',
  preto: '#111827',
  branco: '#f8fafc',
  laranja: '#f97316',
  azul: '#2563eb',
  verde: '#16a34a',
  vermelho: '#dc2626',
  rosa: '#db2777',
  amarelo: '#eab308',
  marrom: '#78350f',
  dourado: '#b45309',
  bege: '#d6cbb8',
  cinza: '#6b7280',
  turquesa: '#0d9488',
  vinho: '#7f1d1d',
}

function resolveColors(colors: string[]): string[] {
  const resolved: string[] = []
  for (const raw of colors) {
    const key = raw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    if (COLOR_WORD_MAP[key] && !resolved.includes(COLOR_WORD_MAP[key])) resolved.push(COLOR_WORD_MAP[key])
  }
  return resolved
}

const BRAND_PALETTE = ['#6748fa', '#c026d3', '#f97316']

function cardBackground(index: number, resolvedColors: string[]): string {
  const palette = resolvedColors.length ? resolvedColors : BRAND_PALETTE
  const c1 = palette[0]
  const c2 = palette[1] ?? palette[0]
  const c3 = palette[2] ?? c2
  const variants = [
    `linear-gradient(135deg, ${c1} 0%, ${c2} 60%, ${c3} 100%)`,
    `radial-gradient(circle at 25% 15%, ${c1} 0%, ${c2} 55%, ${c3} 100%)`,
    `linear-gradient(210deg, ${c3} 0%, ${c1} 50%, ${c2} 100%)`,
  ]
  return variants[index % variants.length]
}

function PreviewCard({
  preview,
  index,
  colors,
  brandName,
  expanded,
  onToggle,
}: {
  preview: ContentPreview
  index: number
  colors: string[]
  brandName: string
  expanded: boolean
  onToggle: () => void
}) {
  const meta = OBJECTIVE_META[preview.objective]
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-2xl p-4 text-left shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-500 hover:scale-[1.01]"
      style={{ background: cardBackground(index, colors) }}
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-black/15 blur-2xl" />

      <div className="relative flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          {meta.label}
        </span>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {FORMAT_LABEL[preview.format]}
        </span>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">{meta.hint}</p>
        <p className={cn('font-semibold text-white drop-shadow-sm', expanded ? '' : 'line-clamp-3')}>{preview.title}</p>
        {preview.support && (
          <p className={cn('text-xs text-white/85', expanded ? '' : 'line-clamp-2')}>{preview.support}</p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <PosttouMark size={14} className="opacity-90" />
          <span className="text-[10px] font-medium text-white/70">{brandName || 'POSTTOU'}</span>
        </div>
      </div>
    </button>
  )
}

export function ContentPreviewCards({
  ideas,
  dna,
  onContinue,
}: {
  ideas: DiscoveryIdea[]
  dna: DnaReviewState
  onContinue: () => void
}) {
  const previews = React.useMemo(() => buildContentPreviews(ideas, dna), [ideas, dna])
  const resolvedColors = React.useMemo(() => resolveColors(dna.colors), [dna.colors])
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-50">
          Já pensamos nos seus primeiros conteúdos.
        </h2>
        <p className="mt-1 text-sm text-ink-500">Três ideias diferentes, todas feitas a partir do DNA da sua marca.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {previews.map((preview, i) => (
          <PreviewCard
            key={preview.objective}
            preview={preview}
            index={i}
            colors={resolvedColors}
            brandName={dna.name}
            expanded={expandedIndex === i}
            onToggle={() => setExpandedIndex((prev) => (prev === i ? null : i))}
          />
        ))}
      </div>

      <p className="text-center text-xs text-ink-400">
        Prévia ilustrativa da ideia — a arte final é gerada depois, já dentro do POSTTOU.
      </p>

      <Button size="lg" className="w-full sm:w-auto sm:self-center" onClick={onContinue}>
        Continuar
      </Button>
    </div>
  )
}
