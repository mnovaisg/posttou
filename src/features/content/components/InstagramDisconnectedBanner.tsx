import { useMutation, useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
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
    <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-brand-900 dark:bg-brand-950">
      <Camera className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
      <p className="min-w-0 flex-1 text-xs text-brand-900 dark:text-brand-100">
        Conecte seu Instagram para publicar, agendar e acompanhar seus resultados.
      </p>
      <Button
        size="sm"
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
        className="shrink-0"
      >
        {connectMutation.isPending ? 'Redirecionando…' : 'Conectar Instagram'}
      </Button>
    </div>
  )
}
