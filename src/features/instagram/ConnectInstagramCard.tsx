import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  InstagramNotConfiguredError,
  disconnectInstagramAccount,
  fetchInstagramAccount,
  startInstagramOAuth,
} from '@/features/instagram/api'
import { INSTAGRAM_ERROR_MESSAGES } from '@/features/instagram/types'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function ConnectInstagramCard() {
  const { activeWorkspace, hasRole } = useWorkspace()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const canManage = hasRole(['owner', 'admin'])
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)

  const workspaceId = activeWorkspace?.id ?? ''

  const { data: account, isLoading } = useQuery({
    queryKey: ['instagram-account', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchInstagramAccount(workspaceId),
  })

  const successMessage = searchParams.get('instagram') === 'success'
  const errorCode = searchParams.get('instagram_error')

  React.useEffect(() => {
    if (successMessage || errorCode) {
      queryClient.invalidateQueries({ queryKey: ['instagram-account', workspaceId] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearParams() {
    const next = new URLSearchParams(searchParams)
    next.delete('instagram')
    next.delete('instagram_error')
    next.delete('instagram_error_detail')
    setSearchParams(next, { replace: true })
  }

  const connectMutation = useMutation({
    mutationFn: () => startInstagramOAuth(workspaceId),
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectInstagramAccount(workspaceId, account!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-account', workspaceId] })
      setConfirmDisconnect(false)
    },
  })

  if (!workspaceId || isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Instagram</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-ink-400">Carregando…</p></CardContent>
      </Card>
    )
  }

  const isConnected = account && account.status === 'conectado'
  const isExpired = account && account.status === 'token_expirado'
  const isErrorStatus = account && account.status === 'erro'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instagram</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {successMessage && (
          <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            <span>Instagram conectado com sucesso!</span>
            <button type="button" onClick={clearParams} className="text-xs underline">fechar</button>
          </div>
        )}
        {errorCode && (
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-danger-500 dark:bg-red-950">
            <span>{INSTAGRAM_ERROR_MESSAGES[errorCode] ?? `Não foi possível conectar (${errorCode}).`}</span>
            <button type="button" onClick={clearParams} className="text-xs underline">fechar</button>
          </div>
        )}

        {!account && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-500">
              Conecte a conta profissional do Instagram do seu negócio para desbloquear a descoberta automática de marca e, futuramente, publicação direta.
            </p>
            {canManage ? (
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="self-start"
              >
                {connectMutation.isPending ? 'Redirecionando…' : '📷 Conectar Instagram'}
              </Button>
            ) : (
              <p className="text-xs text-ink-400">Só owner/admin do workspace pode conectar o Instagram.</p>
            )}
            {connectMutation.isError && (
              <p className="text-sm text-danger-500">
                {connectMutation.error instanceof InstagramNotConfiguredError
                  ? connectMutation.error.message
                  : connectMutation.error instanceof Error
                    ? connectMutation.error.message
                    : 'Erro inesperado.'}
              </p>
            )}
          </div>
        )}

        {account && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {account.profile_picture_url ? (
                <img src={account.profile_picture_url} alt={account.username ?? ''} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-lg dark:bg-ink-800">📷</div>
              )}
              <div className="flex-1">
                <p className="font-medium text-ink-900 dark:text-ink-50">@{account.username}</p>
                <p className="text-xs text-ink-400">ID: {account.ig_user_id}</p>
              </div>
              <Badge variant={isConnected ? 'success' : isExpired || isErrorStatus ? 'warning' : 'neutral'}>
                {isConnected ? 'Conectado' : isExpired ? 'Token expirado' : isErrorStatus ? 'Erro' : account.status}
              </Badge>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs text-ink-500">
              <div>
                <dt className="text-ink-400">Conectado em</dt>
                <dd>{formatDate(account.last_connected_at)}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Token expira em</dt>
                <dd>{formatDate(account.token_expires_at)}</dd>
              </div>
            </dl>

            {(isExpired || isErrorStatus) && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                A conexão precisa ser refeita. Clique em "Reconectar" para autorizar novamente.
              </p>
            )}

            {canManage && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  {connectMutation.isPending ? 'Redirecionando…' : 'Reconectar'}
                </Button>
                {!confirmDisconnect ? (
                  <Button variant="danger" onClick={() => setConfirmDisconnect(true)}>
                    Desconectar
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="danger" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                      {disconnectMutation.isPending ? 'Desconectando…' : 'Confirmar desconexão'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>Cancelar</Button>
                  </div>
                )}
              </div>
            )}
            {disconnectMutation.isError && (
              <p className="text-sm text-danger-500">{disconnectMutation.error instanceof Error ? disconnectMutation.error.message : 'Erro ao desconectar.'}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
