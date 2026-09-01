import * as React from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Image, GalleryHorizontalEnd, Clapperboard } from 'lucide-react'
import { listContents, getContentCoverThumbnails } from '@/features/content/api'
import type { ContentFilters, ContentType } from '@/features/content/types'
import { ORIGIN_ICON } from '@/features/content/types'
import { StatusBadge } from '@/features/content/components/StatusBadge'
import { ContentEmptyState } from '@/features/content/components/ContentEmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const ASPECT_CLASS: Record<string, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
}

// Ícone discreto + rótulo do estado "sem arte ainda" — nunca o emoji
// grande de TYPE_ICON, que era o único elemento do card vazio antes desta
// mudança e por isso parecia quebrado, não intencional.
const TYPE_PLACEHOLDER_ICON: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  post: Image,
  carrossel: GalleryHorizontalEnd,
  reel: Clapperboard,
}

interface EmptyStateConfig {
  title: string
  description: string
  ctaLabel: string
  onCreate?: () => void
}

export function GridView({
  workspaceId,
  filters,
  emptyState,
}: {
  workspaceId: string
  filters: ContentFilters
  emptyState: EmptyStateConfig
}) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['contents', 'grade', workspaceId, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listContents(workspaceId, filters, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0)
      return loaded < lastPage.count ? allPages.length : undefined
    },
  })

  const rows = data?.pages.flatMap((p) => p.rows) ?? []
  const rowIds = rows.map((row) => row.id)

  const { data: coverThumbnails } = useQuery({
    queryKey: ['content-cover-thumbnails', workspaceId, rowIds.join(',')],
    enabled: rowIds.length > 0,
    queryFn: () => getContentCoverThumbnails(rowIds),
  })

  const [brokenCovers, setBrokenCovers] = React.useState<Record<string, true>>({})

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <ContentEmptyState
        title={emptyState.title}
        description={emptyState.description}
        ctaLabel={emptyState.ctaLabel}
        onCreate={emptyState.onCreate}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((row) => {
          const coverUrl = coverThumbnails?.[row.id]
          const showImage = !!coverUrl && !brokenCovers[row.id]
          const PlaceholderIcon = TYPE_PLACEHOLDER_ICON[row.type]

          return (
            <Link
              key={row.id}
              to={`/conteudo/${row.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-shadow hover:shadow-md dark:border-ink-700 dark:bg-ink-900"
            >
              <div
                className={`relative flex ${ASPECT_CLASS[row.format]} items-center justify-center overflow-hidden ${
                  showImage
                    ? 'bg-ink-100 dark:bg-ink-800'
                    : 'bg-gradient-to-br from-brand-50 via-fuchsia-50 to-orange-50 dark:from-ink-800 dark:via-ink-800 dark:to-ink-900'
                }`}
              >
                {showImage ? (
                  <img
                    src={coverUrl}
                    alt={row.title}
                    className="h-full w-full object-cover"
                    onError={() => setBrokenCovers((prev) => ({ ...prev, [row.id]: true }))}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-3 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-500 shadow-sm dark:bg-ink-700/70 dark:text-brand-300">
                      <PlaceholderIcon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-ink-400 dark:text-ink-500">
                      Arte ainda não criada
                    </span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
                  {ORIGIN_ICON[row.origin]}
                </span>
                <span className="absolute right-2 top-2">
                  <StatusBadge status={row.status} />
                </span>
              </div>
              <div className="flex flex-col gap-1 p-3">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{row.title}</p>
                {row.caption && <p className="line-clamp-2 text-xs text-ink-500">{row.caption}</p>}
              </div>
            </Link>
          )
        })}
      </div>

      {hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
          {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  )
}
