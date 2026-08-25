import * as React from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listContents, duplicateContent, softDeleteContent } from '@/features/content/api'
import type { ContentFilters, ContentRow } from '@/features/content/types'
import { ORIGIN_ICON, ORIGIN_LABEL, TYPE_ICON, TYPE_LABEL } from '@/features/content/types'
import { StatusBadge } from '@/features/content/components/StatusBadge'
import { ContentEmptyState } from '@/features/content/components/ContentEmptyState'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { formatInTimeZone } from '@/lib/timezone'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface EmptyStateConfig {
  title: string
  description: string
  ctaLabel: string
  onCreate?: () => void
}

export function ListView({
  workspaceId,
  filters,
  emptyState,
}: {
  workspaceId: string
  filters: ContentFilters
  emptyState: EmptyStateConfig
}) {
  const { activeWorkspace, hasRole } = useWorkspace()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = React.useState<ContentRow | null>(null)
  const canWrite = hasRole(['owner', 'admin', 'editor'])

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['contents', 'lista', workspaceId, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listContents(workspaceId, filters, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0)
      return loaded < lastPage.count ? allPages.length : undefined
    },
  })

  const rows = data?.pages.flatMap((p) => p.rows) ?? []
  const total = data?.pages[0]?.count ?? 0

  const duplicateMutation = useMutation({
    mutationFn: (row: ContentRow) => duplicateContent(row),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ queryKey: ['content-summary'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteContent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ queryKey: ['content-summary'] })
      setConfirmDelete(null)
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
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

  const tz = activeWorkspace?.timezone ?? 'America/Sao_Paulo'

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-700">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-ink-50 text-left text-xs font-medium uppercase text-ink-400 dark:bg-ink-800">
            <tr>
              <th className="px-4 py-3">Conteúdo</th>
              <th className="px-4 py-3">Formato</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data/Horário</th>
              <th className="px-4 py-3">Atualizado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-ink-50/60 dark:hover:bg-ink-800/60">
                <td className="px-4 py-3">
                  <Link to={`/conteudo/${row.id}`} className="font-medium text-ink-900 hover:text-brand-600 dark:text-ink-50">
                    {row.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {TYPE_ICON[row.type]} {TYPE_LABEL[row.type]}
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {ORIGIN_ICON[row.origin]} {ORIGIN_LABEL[row.origin]}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {row.scheduled_at ? formatInTimeZone(row.scheduled_at, tz) : '—'}
                </td>
                <td className="px-4 py-3 text-ink-400">{formatInTimeZone(row.updated_at, tz)}</td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md px-2 py-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
                      ⋯
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/conteudo/${row.id}`}>Abrir</Link>
                      </DropdownMenuItem>
                      {canWrite && (
                        <DropdownMenuItem onSelect={() => duplicateMutation.mutate(row)}>Duplicar</DropdownMenuItem>
                      )}
                      {canWrite && (
                        <DropdownMenuItem onSelect={() => setConfirmDelete(row)} className="text-danger-500">
                          Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
          {isFetchingNextPage ? 'Carregando…' : `Carregar mais (${rows.length}/${total})`}
        </Button>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[min(420px,92vw)] rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">Excluir conteúdo?</h3>
            <p className="mt-1 text-sm text-ink-500">
              "{confirmDelete.title}" será movido para excluído. O histórico de auditoria é preservado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
              >
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
