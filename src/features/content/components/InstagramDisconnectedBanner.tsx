import { useMutation, useQuery } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Button } from '@/components/ui/button'
import { fetchInstagramAccount, startInstagramOAuth } from '@/features/instagram/api'

/**
 * Aviso discreto quando não há Instagram conectado — reaproveita a
 * mesma query/mutação de ConnectInstagramCard (dedupe via React Query,
 * sem chamada extra) e o mesmo backend de OAuth, sem alterar nenhum dos
 * dois. Nunca bloqueia criação de conteúdo: é só um lembrete no topo,
 * que some sozinho assim que a conta é conectada.
 */
export function InstagramDisconnectedBanner() {
  const { activeWorkspace, hasRole } = useWorkspace()
  const canManage = hasRole(['owner', 'admin'])
  const workspaceId = activeWorkspace?.id ?? ''

  const { data: account, isLoading } = useQuery({
    queryKey: ['instagram-account', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchInstagramAccount(workspaceId),
  })

  const connectMutation = useMutation({
    mutationFn: () => startInstagramOAuth(workspaceId),
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl
    },
  })

  if (!workspaceId || isLoading || account) return null
  if (!canManage) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-brand-900 dark:text-brand-100">
        Conecte seu Instagram para publicar, agendar e acompanhar seus resultados.
      </p>
      <Button
        size="sm"
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
        className="self-start sm:self-auto"
      >
        {connectMutation.isPending ? 'Redirecionando…' : 'Conectar Instagram'}
      </Button>
    </div>
  )
}
