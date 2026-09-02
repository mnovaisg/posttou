import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Image, GalleryHorizontalEnd, Clapperboard } from 'lucide-react'
import { listUndatedContents, getContentCoverThumbnails } from '@/features/content/api'
import type { ContentType } from '@/features/content/types'
import {
  classifyContentObjective,
  contentPlaceholderPalette,
  hashSeed,
  OBJECTIVE_META,
} from '@/features/content/placeholder'
import { Skeleton } from '@/components/ui/skeleton'

const TYPE_PLACEHOLDER_ICON: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  post: Image,
  carrossel: GalleryHorizontalEnd,
  reel: Clapperboard,
}

const TYPE_LABEL: Record<ContentType, string> = {
  post: 'Post',
  carrossel: 'Carrossel',
  reel: 'Reel',
}

/**
 * 3 composições determinísticas (posição das formas abstratas + do texto)
 * escolhidas por hash do id — o mesmo conteúdo sempre cai na mesma
 * composição, e cards vizinhos tendem a variar. Nunca é imagem: só divs
 * com gradiente/blur, nas cores do DNA.
 */
function ShapeComposition({ variant, palette }: { variant: number; palette: [string, string, string] }) {
  const [c1, c2, c3] = palette
  if (variant === 1) {
    return (
      <>
        <span aria-hidden className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full blur-xl" style={{ background: `${c2}66` }} />
        <span aria-hidden className="pointer-events-none absolute bottom-6 right-4 h-16 w-16 rounded-full border-2" style={{ borderColor: `${c3}99` }} />
      </>
    )
  }
  if (variant === 2) {
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 top-1/3 h-24 w-24 rotate-12 rounded-3xl blur-lg"
          style={{ background: `${c1}55` }}
        />
        <span aria-hidden className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full blur-xl" style={{ background: `${c3}55` }} />
      </>
    )
  }
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl" style={{ background: `${c2}55` }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full blur-2xl" style={{ background: `${c1}44` }} />
    </>
  )
}

function SuggestionThumb({
  id,
  title,
  caption,
  type,
  dnaColors,
}: {
  id: string
  title: string
  caption: string | null
  type: ContentType
  dnaColors: string[]
}) {
  const palette = contentPlaceholderPalette(dnaColors)
  const [c1, c2, c3] = palette
  const seed = hashSeed(id)
  const variant = seed % 3
  const objective = classifyContentObjective(id, title, caption)
  const PlaceholderIcon = TYPE_PLACEHOLDER_ICON[type]
  const gradients = [
    `linear-gradient(135deg, ${c1} 0%, ${c2} 60%, ${c3} 100%)`,
    `radial-gradient(circle at 25% 15%, ${c1} 0%, ${c2} 55%, ${c3} 100%)`,
    `linear-gradient(210deg, ${c3} 0%, ${c1} 50%, ${c2} 100%)`,
  ]

  return (
    <div className="relative flex aspect-[4/5] flex-col justify-between overflow-hidden p-2.5" style={{ background: gradients[variant] }}>
      <ShapeComposition variant={variant} palette={palette} />

      <div className="relative flex items-start justify-between gap-1">
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          {OBJECTIVE_META[objective]}
        </span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm">
          <PlaceholderIcon className="h-3 w-3" />
        </span>
      </div>

      <div className="relative flex flex-col gap-1">
        <p className="line-clamp-3 text-[11px] font-semibold leading-tight text-white drop-shadow-sm">{title}</p>
        <span className="text-[9px] font-medium text-white/70">{TYPE_LABEL[type]}</span>
      </div>
    </div>
  )
}

/**
 * Seção "Sem data (N)" — conteúdo ainda sem agendamento, sempre visível
 * no topo de Meu Conteúdo independente do filtro/visualização escolhida.
 * É aqui que as 3 sugestões promovidas no claim do Bloco 5 aparecem
 * imediatamente após o primeiro login, sem precisar navegar ou filtrar
 * nada. Discreto quando vazio (nunca aparece), sem exigir criação de
 * "seção de onboarding" separada — o mesmo padrão serve para qualquer
 * rascunho sem data futura.
 */
export function UndatedContentStrip({ workspaceId, dnaColors = [] }: { workspaceId: string; dnaColors?: string[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ['contents', 'sem-data', workspaceId],
    queryFn: () => listUndatedContents(workspaceId),
    enabled: !!workspaceId,
  })

  const rows = data?.rows ?? []
  const rowIds = rows.map((r) => r.id)

  const { data: coverThumbnails } = useQuery({
    queryKey: ['content-cover-thumbnails', workspaceId, rowIds.join(',')],
    enabled: rowIds.length > 0,
    queryFn: () => getContentCoverThumbnails(rowIds),
  })

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-36 shrink-0 rounded-xl" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">Sem data ({data?.count ?? rows.length})</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {rows.map((row) => {
          const coverUrl = coverThumbnails?.[row.id]
          return (
            <Link
              key={row.id}
              to={`/conteudo/${row.id}`}
              className="group flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-shadow hover:shadow-md dark:border-ink-700 dark:bg-ink-900"
            >
              {coverUrl ? (
                <div className="relative aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800">
                  <img src={coverUrl} alt={row.title} className="h-full w-full object-cover" />
                </div>
              ) : (
                <SuggestionThumb id={row.id} title={row.title} caption={row.caption} type={row.type} dnaColors={dnaColors} />
              )}
              <div className="flex flex-col gap-1 p-2">
                <p className="line-clamp-2 text-xs font-medium text-ink-900 dark:text-ink-50">{row.title}</p>
                {row.origin === 'ia' && <span className="text-[10px] text-ink-400">✨ Sugestão</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
