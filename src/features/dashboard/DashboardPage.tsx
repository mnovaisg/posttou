import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { getContentSummary } from '@/features/content/api'
import { STATUS_LABEL, TYPE_ICON } from '@/features/content/types'
import type { ContentRow } from '@/features/content/types'
import { formatInTimeZone } from '@/lib/timezone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS } from '@/app/nav-items'

interface DashboardData {
  creditBalance: number
  contentCount: number
  contentRascunho: number
  contentAgendado: number
  contentPublicado: number
  instagramConnectedCount: number
  instagramTotalCount: number
  brandDnaCompleted: boolean
  upcoming: ContentRow[]
}

function useDashboardData(workspaceId: string | null) {
  return useQuery({
    queryKey: ['dashboard', workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<DashboardData> => {
      const [{ data: account }, summary, { data: igAccounts }, { data: brandProfile }, { data: upcoming }] = await Promise.all([
        supabase.from('credit_accounts').select('balance').eq('workspace_id', workspaceId!).maybeSingle(),
        getContentSummary(workspaceId!),
        supabase.from('instagram_accounts').select('status').eq('workspace_id', workspaceId!),
        supabase.from('brand_profiles').select('onboarding_completed_at').eq('workspace_id', workspaceId!).maybeSingle(),
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
        brandDnaCompleted: !!brandProfile?.onboarding_completed_at,
        upcoming: upcoming ?? [],
      }
    },
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace()
  const { data, isLoading } = useDashboardData(activeWorkspace?.id ?? null)
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email

  const onboardingSteps = [
    { label: 'Criar workspace', done: !!activeWorkspace },
    { label: 'Configurar DNA da Marca', done: !!data?.brandDnaCompleted },
    { label: 'Conectar Instagram', done: (data?.instagramConnectedCount ?? 0) > 0 },
    { label: 'Criar primeiro conteúdo', done: (data?.contentCount ?? 0) > 0 },
  ]
  const completedSteps = onboardingSteps.filter((s) => s.done).length

  if (workspaceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card>
          <CardHeader>
            <CardTitle>Onboarding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-ink-900 dark:text-ink-50">
              {completedSteps}/{onboardingSteps.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Primeiros passos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {onboardingSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    step.done
                      ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white'
                      : 'flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 dark:border-ink-600'
                  }
                >
                  {step.done ? '✓' : ''}
                </span>
                <span className={step.done ? 'text-ink-400 line-through' : 'text-ink-700 dark:text-ink-200'}>
                  {step.label}
                </span>
              </div>
            ))}
            <Button variant="secondary" size="sm" className="mt-2" asChild>
              <Link to={data?.brandDnaCompleted ? '/conteudo' : '/dna-da-marca'}>Continuar onboarding</Link>
            </Button>
          </CardContent>
        </Card>
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
