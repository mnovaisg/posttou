import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Image, GalleryHorizontalEnd, Clapperboard } from 'lucide-react'
import { listUndatedContents, getContentCoverThumbnails } from '@/features/content/api'
import type { ContentType } from '@/features/content/types'
import { contentPlaceholderBackground } from '@/features/content/placeholder'
import { Skeleton } from '@/components/ui/skeleton'

const TYPE_PLACEHOLDER_ICON: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  post: Image,
  carrossel: GalleryHorizontalEnd,
  reel: Clapperboard,
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
          <Skeleton key={i} className="h-40 w-32 shrink-0 rounded-xl" />
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
          const PlaceholderIcon = TYPE_PLACEHOLDER_ICON[row.type]
          return (
            <Link
              key={row.id}
              to={`/conteudo/${row.id}`}
              className="group flex w-32 shrink-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-shadow hover:shadow-md dark:border-ink-700 dark:bg-ink-900"
            >
              <div
                className="relative flex aspect-[4/5] items-center justify-center overflow-hidden"
                style={coverUrl ? undefined : { background: contentPlaceholderBackground(row.id, dnaColors) }}
              >
                {coverUrl ? (
                  <img src={coverUrl} alt={row.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 px-2 text-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm">
                      <PlaceholderIcon className="h-4 w-4" />
                    </span>
                    {row.origin === 'ia' && (
                      <span className="text-[9px] font-medium leading-tight text-white/80">✨ Sugestão</span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-medium text-ink-900 dark:text-ink-50">{row.title}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
