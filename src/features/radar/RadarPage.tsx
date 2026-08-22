import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchLatestRadarRun, fetchRadarOpportunities, setRadarOpportunityStatus } from '@/features/radar/api'
import { savePendingRadarIdea } from '@/features/radar/session-token'
import { CONFIDENCE_LABEL } from '@/features/radar/types'
import type { RadarConfidence, RadarOpportunityWithCluster } from '@/features/radar/types'
import { TYPE_ICON, TYPE_LABEL } from '@/features/content/types'
import type { ContentType } from '@/features/content/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const CONFIDENCE_VARIANT: Record<RadarConfidence, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'success',
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'há poucos minutos'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days > 1 ? 's' : ''}`
}

export function RadarPage() {
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id ?? ''

  const opportunitiesQuery = useQuery({
    queryKey: ['radar-opportunities', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchRadarOpportunities(workspaceId),
  })

  const runQuery = useQuery({ queryKey: ['radar-latest-run'], queryFn: fetchLatestRadarRun })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'saved' | 'dismissed' }) => setRadarOpportunityStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['radar-opportunities', workspaceId] }),
  })

  function transformIntoContent(opp: RadarOpportunityWithCluster) {
    const cluster = opp.radar_clusters
    savePendingRadarIdea({
      opportunityId: opp.id,
      titulo: opp.suggested_title ?? cluster?.theme_summary ?? 'Ideia do Radar',
      resumo: [opp.suggested_angle, 'Não copie o conteúdo de origem. Crie uma abordagem original.'].filter(Boolean).join('\n\n'),
      formato: (opp.suggested_format as 'post' | 'carrossel' | 'reel') ?? 'post',
    })
    navigate('/criar')
  }

  if (!activeWorkspace) return null

  const opportunities = opportunitiesQuery.data ?? []
  const lastRun = runQuery.data
  const providerFailures = lastRun?.providers_failed ? Object.entries(lastRun.providers_failed) : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Radar Viral</h1>
        <p className="mt-1 text-sm text-ink-500">
          Oportunidades de conteúdo original a partir de sinais reais — baseado em vídeos em alta no YouTube, cruzados com o DNA da sua marca.
        </p>
      </div>

      {lastRun && (
        <p className="text-xs text-ink-400">
          Última atualização: {timeAgo(lastRun.started_at)} · {lastRun.signals_collected} sinal(is) coletado(s) nesta execução.
          {providerFailures.length > 0 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              ({providerFailures.map(([p]) => p).join(', ')} indisponível no momento — os demais continuaram normalmente.)
            </span>
          )}
        </p>
      )}

      {opportunitiesQuery.isLoading && <p className="text-sm text-ink-500">Carregando oportunidades…</p>}

      {!opportunitiesQuery.isLoading && opportunities.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl">🔥</span>
            <p className="font-medium text-ink-900 dark:text-ink-50">Nenhuma oportunidade agora.</p>
            <p className="max-w-md text-sm text-ink-500">
              O Radar coleta sinais reais periodicamente (hoje, só do YouTube) e cruza com o DNA da sua marca. Sem dado real disponível ainda —
              nunca inventamos uma tendência para preencher esta tela. Complete o DNA da marca para melhorar o cruzamento assim que houver sinais.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {opportunities.map((opp) => {
          const cluster = opp.radar_clusters
          const breakdown = (cluster?.viral_score_breakdown ?? {}) as Record<string, unknown>
          const format = (opp.suggested_format ?? 'post') as ContentType
          return (
            <Card key={opp.id}>
              <CardContent className="flex flex-col gap-3 py-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{TYPE_ICON[format]}</span>
                    <p className="font-medium text-ink-900 dark:text-ink-50">{opp.suggested_title ?? cluster?.theme_summary}</p>
                  </div>
                  <Badge variant="brand">{opp.opportunity_score}/100</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={CONFIDENCE_VARIANT[opp.confidence as RadarConfidence]}>{CONFIDENCE_LABEL[opp.confidence as RadarConfidence]}</Badge>
                  <Badge variant="neutral">{TYPE_LABEL[format]}</Badge>
                  <Badge variant="neutral">Baseado em sinais do YouTube</Badge>
                </div>

                {cluster && <p className="text-sm text-ink-600 dark:text-ink-300">{cluster.theme_summary}</p>}
                {opp.suggested_angle && <p className="text-sm text-ink-500">{opp.suggested_angle}</p>}

                <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500 dark:bg-ink-800">
                  <p>
                    Score viral: {cluster?.viral_score ?? '—'}/100 · Compatibilidade com a marca: {opp.brand_fit_score}/100 · Novidade: {opp.novelty_score}/100
                  </p>
                  <p className="mt-1">
                    {cluster?.signal_count ?? 0} sinal(is) considerado(s)
                    {typeof breakdown.avg_days_since_published === 'number' ? ` · publicados em média há ${Math.round(breakdown.avg_days_since_published)} dia(s)` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => transformIntoContent(opp)}>
                    Transformar em conteúdo
                  </Button>
                  {opp.status !== 'saved' && (
                    <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: opp.id, status: 'saved' })}>
                      Salvar oportunidade
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: opp.id, status: 'dismissed' })}>
                    Não me interessa
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
