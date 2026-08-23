import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchActiveInsights, fetchPerformanceFacts, fetchTopContentPerformance, requestPerformanceExplanation, setInsightFeedback } from '@/features/reports/api'
import { BASELINE_TIER_LABEL, CONFIDENCE_LABEL, MATURITY_LABEL, badgeForScore } from '@/features/reports/types'
import { applyRecommendation, dismissRecommendation, fetchActiveRecommendations, startExperiment } from '@/features/strategy/api'
import { RECOMMENDATION_TYPE_LABEL, TARGET_LABEL } from '@/features/strategy/types'
import { formatInTimeZone } from '@/lib/timezone'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PERIOD_DAYS = 30

const TONE_CLASS: Record<string, string> = {
  above: 'bg-emerald-100 text-emerald-800',
  average: 'bg-amber-100 text-amber-800',
  below: 'bg-slate-100 text-slate-700',
  none: 'bg-slate-100 text-slate-500',
}

const ORIGIN_LABEL: Record<string, string> = { manual: 'Manual', ia: 'Criado com IA', radar: 'Radar', autopilot: 'Piloto Automático' }
const FORMAT_LABEL: Record<string, string> = { post: 'Post', carrossel: 'Carrossel', reel: 'Reel' }

export function ReportsPage() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id ?? ''

  const factsQuery = useQuery({ queryKey: ['performance-facts', workspaceId], enabled: !!workspaceId, queryFn: () => fetchPerformanceFacts(workspaceId, PERIOD_DAYS) })
  const insightsQuery = useQuery({ queryKey: ['performance-insights', workspaceId], enabled: !!workspaceId, queryFn: () => fetchActiveInsights(workspaceId) })
  const topContentQuery = useQuery({ queryKey: ['performance-top-content', workspaceId], enabled: !!workspaceId, queryFn: () => fetchTopContentPerformance(workspaceId, PERIOD_DAYS) })
  const recommendationsQuery = useQuery({ queryKey: ['strategy-recommendations', workspaceId], enabled: !!workspaceId, queryFn: () => fetchActiveRecommendations(workspaceId) })

  const [applyError, setApplyError] = React.useState<string | null>(null)
  const applyMutation = useMutation({
    mutationFn: (id: string) => applyRecommendation(id),
    onSuccess: () => {
      setApplyError(null)
      queryClient.invalidateQueries({ queryKey: ['strategy-recommendations', workspaceId] })
    },
    onError: (err: Error) => setApplyError(err.message.includes('recommendation_stale') ? 'Sua estratégia mudou desde que esta recomendação foi criada. Gere uma nova recomendação.' : err.message),
  })
  const dismissRecMutation = useMutation({
    mutationFn: (id: string) => dismissRecommendation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategy-recommendations', workspaceId] }),
  })
  const testFirstMutation = useMutation({
    mutationFn: (rec: import('@/features/strategy/types').StrategyRecommendationRow) => {
      const evidence = rec.evidence as Record<string, unknown>
      const dimension = evidence.editorial_role ? 'editorial_role' : evidence.format ? 'format' : 'origin'
      const variant: Record<string, string> = {}
      if (evidence.editorial_role) variant.editorial_role = String(evidence.editorial_role)
      if (evidence.format) variant.format = String(evidence.format)
      return startExperiment({
        workspaceId,
        hypothesis: rec.interpretation,
        dimension,
        variant,
        recommendationId: rec.id,
      })
    },
    onSuccess: () => {
      setApplyError(null)
      queryClient.invalidateQueries({ queryKey: ['strategy-experiment', workspaceId] })
    },
    onError: (err: Error) => setApplyError(err.message),
  })

  const [explanation, setExplanation] = React.useState<{ title: string; description: string } | null>(null)
  const [explainError, setExplainError] = React.useState<string | null>(null)

  const explainMutation = useMutation({
    mutationFn: () => requestPerformanceExplanation(workspaceId, PERIOD_DAYS),
    onSuccess: (result) => {
      setExplanation({ title: result.title, description: result.description })
      setExplainError(null)
    },
    onError: (err: Error) => setExplainError(err.message),
  })

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback, dismiss }: { id: string; feedback?: 'useful' | 'not_useful'; dismiss?: boolean }) => setInsightFeedback(id, feedback, dismiss),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance-insights', workspaceId] }),
  })

  if (!activeWorkspace) return null

  const facts = factsQuery.data
  const overall = facts?.overall
  const sampleSize = overall?.sample_size ?? 0
  const hasEnoughData = sampleSize >= (facts?.min_sample_provisional ?? 5)

  const scoreDelta =
    overall?.avg_score != null && overall?.avg_score_previous != null && overall.avg_score_previous > 0
      ? Math.round(((overall.avg_score - overall.avg_score_previous) / overall.avg_score_previous) * 100)
      : null

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Performance</h1>
        <p className="text-muted-foreground">Entenda o que está funcionando no seu conteúdo.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Publicações analisadas ({PERIOD_DAYS}d)</p>
            <p className="text-3xl font-semibold">{sampleSize}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Score médio de performance</p>
            <p className="text-3xl font-semibold">{hasEnoughData && overall?.avg_score != null ? overall.avg_score : '—'}</p>
            {scoreDelta != null && hasEnoughData && (
              <p className={`text-sm ${scoreDelta >= 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                {scoreDelta >= 0 ? '+' : ''}
                {scoreDelta}% vs. período anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Engajamento médio (interações/alcance)</p>
            <p className="text-3xl font-semibold">{hasEnoughData && overall?.avg_relative_engagement != null ? `${Math.round(overall.avg_relative_engagement * 100)}º pct.` : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {!hasEnoughData && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Estamos aprendendo com suas primeiras publicações. Conforme mais conteúdo for publicado e tiver métricas coletadas, o POSTTOU começa a mostrar comparações e recomendações confiáveis.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">O que o POSTTOU aprendeu</h2>
          <Button size="sm" variant="outline" onClick={() => explainMutation.mutate()} disabled={explainMutation.isPending || !hasEnoughData}>
            {explainMutation.isPending ? 'Gerando…' : 'Explicar melhor'}
          </Button>
        </div>

        {explainError && <p className="text-sm text-red-600">{explainError}</p>}
        {explanation && (
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="font-medium">{explanation.title}</p>
              <p className="text-sm text-muted-foreground">{explanation.description}</p>
            </CardContent>
          </Card>
        )}

        {(insightsQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum aprendizado novo ainda.</p>}
        {(insightsQuery.data ?? []).map((insight) => (
          <Card key={insight.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{insight.title}</p>
                <Badge variant="neutral">{CONFIDENCE_LABEL[insight.confidence]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{insight.description}</p>
              <p className="text-xs text-muted-foreground">
                Amostra: {insight.sample_size} publicações · {insight.source === 'ai' ? 'síntese assistida por IA' : 'cálculo direto'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => feedbackMutation.mutate({ id: insight.id, feedback: 'useful' })}>
                  Útil
                </Button>
                <Button size="sm" variant="ghost" onClick={() => feedbackMutation.mutate({ id: insight.id, feedback: 'not_useful' })}>
                  Não útil
                </Button>
                <Button size="sm" variant="ghost" onClick={() => feedbackMutation.mutate({ id: insight.id, dismiss: true })}>
                  Dispensar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">O que você pode fazer</h2>
        {applyError && <p className="text-sm text-red-600">{applyError}</p>}
        {(recommendationsQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recomendação disponível no momento.</p>}
        {(recommendationsQuery.data ?? []).map((rec) => (
          <Card key={rec.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="neutral">{RECOMMENDATION_TYPE_LABEL[rec.recommendation_type]}</Badge>
                <Badge variant="neutral">{CONFIDENCE_LABEL[rec.confidence]}</Badge>
              </div>
              <p className="text-sm">{rec.interpretation}</p>
              <p className="text-xs text-muted-foreground">
                Baseado em {rec.sample_size} conteúdos · {rec.period_start} a {rec.period_end}
              </p>
              {rec.recommendation_type === 'settings_change' && rec.target && (
                <div className="rounded bg-slate-50 p-2 text-xs">
                  <p className="font-medium">{TARGET_LABEL[rec.target] ?? rec.target}</p>
                  <div className="flex gap-4">
                    <span>Atual: {JSON.stringify(rec.before)}</span>
                    <span>Proposto: {JSON.stringify(rec.after)}</span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {rec.recommendation_type === 'settings_change' && (
                  <Button size="sm" onClick={() => applyMutation.mutate(rec.id)} disabled={applyMutation.isPending}>
                    Aplicar ao Piloto
                  </Button>
                )}
                {rec.recommendation_type !== 'informational' && (
                  <Button size="sm" variant="outline" onClick={() => testFirstMutation.mutate(rec)} disabled={testFirstMutation.isPending}>
                    Testar primeiro
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => dismissRecMutation.mutate(rec.id)}>
                  Dispensar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Melhores conteúdos do período</h2>
        {(topContentQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum conteúdo com métricas coletadas ainda neste período.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(topContentQuery.data ?? []).map((card) => {
            const badge = badgeForScore(card.score?.score ?? null)
            return (
              <Card key={card.instagram_publication_id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{card.title}</p>
                    {card.permalink && (
                      <a href={card.permalink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                        Ver no Instagram
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="neutral">{FORMAT_LABEL[card.format] ?? card.format}</Badge>
                    <Badge variant="neutral">{ORIGIN_LABEL[card.origin] ?? card.origin}</Badge>
                    {card.published_at && <span className="text-muted-foreground">{formatInTimeZone(card.published_at, activeWorkspace.timezone, { dateStyle: 'short' })}</span>}
                  </div>
                  <div className={`inline-block rounded px-2 py-1 text-xs font-medium ${TONE_CLASS[badge.tone]}`}>
                    {badge.label}
                    {card.score?.score != null ? ` (${card.score.score}/100)` : ''}
                  </div>
                  {card.score && (
                    <p className="text-xs text-muted-foreground">
                      {MATURITY_LABEL[card.score.maturity_stage]} · {BASELINE_TIER_LABEL[card.score.baseline_tier]}
                      {card.score.baseline_scope ? ` (baseline por ${card.score.baseline_scope === 'format' ? 'formato' : 'workspace'})` : ''}
                    </p>
                  )}
                  {card.latest_snapshot && (
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>Alcance: {card.latest_snapshot.reach ?? '—'}</span>
                      <span>Interações: {card.latest_snapshot.total_interactions ?? '—'}</span>
                      <span>Salvos: {card.latest_snapshot.saved ?? '—'}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
