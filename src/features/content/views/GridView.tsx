import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listContents } from '@/features/content/api'
import type { ContentFilters } from '@/features/content/types'
import { TYPE_ICON, ORIGIN_ICON } from '@/features/content/types'
import { StatusBadge } from '@/features/content/components/StatusBadge'
import { ContentEmptyState } from '@/features/content/components/ContentEmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const ASPECT_CLASS: Record<string, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
}

export function GridView({ workspaceId, filters }: { workspaceId: string; filters: ContentFilters }) {
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
        title="Você ainda não criou nenhum conteúdo."
        description="Comece criando seu primeiro post, carrossel ou reel."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((row) => (
          <Link
            key={row.id}
            to={`/conteudo/${row.id}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-shadow hover:shadow-md dark:border-ink-700 dark:bg-ink-900"
          >
            <div
              className={`relative flex ${ASPECT_CLASS[row.format]} items-center justify-center bg-ink-100 dark:bg-ink-800`}
            >
              <span className="text-4xl opacity-40">{TYPE_ICON[row.type]}</span>
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
        ))}
      </div>

      {hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
          {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  )
}
