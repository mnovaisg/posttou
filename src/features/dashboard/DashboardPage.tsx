import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { getContentSummary } from '@/features/content/api'
import { STATUS_LABEL, TYPE_ICON } from '@/features/content/types'
import type { ContentRow } from '@/features/content/types'
import { formatInTimeZone } from '@/lib/timezone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { NAV_ITEMS } from '@/app/nav-items'
import { OnboardingWidget } from '@/features/onboarding/OnboardingWidget'
import { fetchOnboardingState } from '@/features/onboarding/api'
import { InstagramNotConfiguredError, startInstagramOAuth } from '@/features/instagram/api'
import { INSTAGRAM_ERROR_MESSAGES } from '@/features/instagram/types'

interface DashboardData {
  creditBalance: number
  contentCount: number
  contentRascunho: number
  contentAgendado: number
  contentPublicado: number
  instagramConnectedCount: number
  instagramTotalCount: number
  upcoming: ContentRow[]
}

function useDashboardData(workspaceId: string | null) {
  return useQuery({
    queryKey: ['dashboard', workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<DashboardData> => {
      const [{ data: account }, summary, { data: igAccounts }, { data: upcoming }] = await Promise.all([
        supabase.from('credit_accounts').select('balance').eq('workspace_id', workspaceId!).maybeSingle(),
        getContentSummary(workspaceId!),
        supabase.from('instagram_accounts').select('status').eq('workspace_id', workspaceId!),
        supabase
          .from('contents')
          .select('*')
          .eq('workspace_id', workspaceId!)
          .eq('status', 'agendado')
          .not('scheduled_at', 'is', null)
          .order('scheduled_at', { ascending: true })
          .limit(5),
      ])

      return {
        creditBalance: account?.balance ?? 0,
        contentCount: summary.total,
        contentRascunho: summary.rascunho,
        contentAgendado: summary.agendado,
        contentPublicado: summary.publicado,
        instagramConnectedCount: (igAccounts ?? []).filter((a) => a.status === 'conectado').length,
        instagramTotalCount: (igAccounts ?? []).length,
        upcoming: upcoming ?? [],
      }
    },
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace()
  const { data, isLoading } = useDashboardData(activeWorkspace?.id ?? null)
  const queryClient = useQueryClient()
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email

  // Etapa 4A — CTA discreto pós-onboarding: reutiliza a MESMA função OAuth
  // do onboarding/Configurações (nenhuma segunda implementação), com
  // return_to='dashboard' pra voltar aqui depois do callback. Some
  // sozinho assim que existir alguma conta conectada — não depende de
  // estado em memória, só do que `useDashboardData` já lê do banco.
  const [searchParams, setSearchParams] = useSearchParams()
  const instagramSuccess = searchParams.get('instagram') === 'success'
  const instagramErrorCode = searchParams.get('instagram_error')

  function clearInstagramParams() {
    const next = new URLSearchParams(searchParams)
    next.delete('instagram')
    next.delete('instagram_error')
    next.delete('instagram_error_detail')
    setSearchParams(next, { replace: true })
  }

  React.useEffect(() => {
    if ((instagramSuccess || instagramErrorCode) && activeWorkspace) {
      queryClient.invalidateQueries({ queryKey: ['dashboard', activeWorkspace.id] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-state', activeWorkspace.id] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectMutation = useMutation({
    mutationFn: () => startInstagramOAuth(activeWorkspace!.id, 'dashboard'),
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl
    },
  })

  // Mesma queryKey do OnboardingWidget — o React Query dedupe a chamada,
  // nenhuma requisição extra. Só usada aqui para decidir a ordem do
  // layout (onboarding em destaque enquanto as etapas obrigatórias não
  // estiverem concluídas); o estado real e a UI do checklist continuam
  // inteiramente dentro do OnboardingWidget.
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding-state', activeWorkspace?.id],
    queryFn: () => fetchOnboardingState(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  })
  const onboardingActive =
    !!onboarding &&
    !onboarding.onboarding_dismissed &&
    !(onboarding.brand_dna_done && onboarding.first_content_done && onboarding.instagram_connected_done && onboarding.first_publish_done)

  if (workspaceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">
          Olá, {fullName?.toString().split(' ')[0] ?? ''} 👋
        </h1>
        <p className="text-sm text-ink-500">
          {activeWorkspace ? activeWorkspace.name : 'Nenhum workspace ativo'}
        </p>
      </div>

      {instagramSuccess && (
        <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          <span>Instagram conectado com sucesso!</span>
          <button type="button" onClick={clearInstagramParams} className="text-xs underline">fechar</button>
        </div>
      )}
      {instagramErrorCode && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-danger-500 dark:bg-red-950">
          <span>{INSTAGRAM_ERROR_MESSAGES[instagramErrorCode] ?? `Não foi possível conectar (${instagramErrorCode}).`}</span>
          <button type="button" onClick={clearInstagramParams} className="text-xs underline">fechar</button>
        </div>
      )}

      {!onboardingActive && activeWorkspace && !isLoading && data?.instagramConnectedCount === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">Seu conteúdo já está pronto.</p>
              <p className="text-sm text-ink-500">Conecte seu Instagram para publicar pelo POSTTOU.</p>
            </div>
            <div className="flex flex-col items-start gap-1">
              <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                {connectMutation.isPending ? 'Redirecionando…' : 'Conectar Instagram'}
              </Button>
              {connectMutation.isError && (
                <p className="text-xs text-danger-500">
                  {connectMutation.error instanceof InstagramNotConfiguredError
                    ? connectMutation.error.message
                    : connectMutation.error instanceof Error
                      ? connectMutation.error.message
                      : 'Erro inesperado.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {onboardingActive && activeWorkspace && (
        <div className="mx-auto w-full max-w-2xl">
          <OnboardingWidget workspaceId={activeWorkspace.id} />
        </div>
      )}

      <div className={onboardingActive ? 'space-y-8 opacity-90' : 'space-y-8'}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Saldo de créditos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-3xl font-semibold text-ink-900 dark:text-ink-50">{data?.creditBalance ?? 0}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Conteúdos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-semibold text-ink-900 dark:text-ink-50">{data?.contentCount ?? 0}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {data?.contentRascunho ?? 0} rascunho · {data?.contentAgendado ?? 0} agendado · {data?.contentPublicado ?? 0} publicado
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contas Instagram</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-semibold text-ink-900 dark:text-ink-50">
                    {data?.instagramConnectedCount ?? 0}
                  </p>
                  <Badge variant={data?.instagramConnectedCount ? 'success' : 'neutral'}>
                    {data?.instagramConnectedCount ? 'conectado' : 'nenhuma conectada'}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className={onboardingActive ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <CardHeader>
              <CardTitle>Atalhos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-3 rounded-lg border border-ink-200 p-3 text-sm font-medium text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </CardContent>
          </Card>

          {!onboardingActive && activeWorkspace && <OnboardingWidget workspaceId={activeWorkspace.id} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos conteúdos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : data && data.upcoming.length > 0 ? (
            <div className="flex flex-col divide-y divide-ink-100 dark:divide-ink-800">
              {data.upcoming.map((item) => (
                <Link
                  key={item.id}
                  to={`/conteudo/${item.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-600"
                >
                  <span className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
                    <span>{TYPE_ICON[item.type]}</span>
                    {item.title}
                  </span>
                  <span className="text-xs text-ink-400">
                    {item.scheduled_at && activeWorkspace
                      ? formatInTimeZone(item.scheduled_at, activeWorkspace.timezone, { dateStyle: 'short', timeStyle: 'short' })
                      : STATUS_LABEL[item.status]}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">Nenhum conteúdo agendado no momento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
