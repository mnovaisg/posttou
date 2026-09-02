import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchBrandProfile } from '@/features/brand-dna/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  addRadarTarget,
  listRadarTargets,
  removeRadarTarget,
  RadarTargetDuplicateError,
  RadarTargetLimitError,
} from '@/features/radar/config-api'
import type { RadarTargetKind } from '@/features/radar/config-api'
import { suggestCompetitors, suggestHashtags, suggestTerms } from '@/features/radar/suggestions'
import { RadarTargetGroup } from '@/features/radar/RadarTargetGroup'

export function RadarConfig() {
  const { user } = useAuth()
  const { activeWorkspace, hasRole } = useWorkspace()
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id ?? ''
  const canWrite = hasRole(['owner', 'admin', 'editor'])
  const [error, setError] = React.useState<string | null>(null)

  const { data: profile } = useQuery({
    queryKey: ['brand-profile', workspaceId],
    queryFn: () => fetchBrandProfile(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: targets } = useQuery({
    queryKey: ['radar-targets', workspaceId],
    queryFn: () => listRadarTargets(workspaceId),
    enabled: !!workspaceId,
  })

  const addMutation = useMutation({
    mutationFn: (vars: { kind: RadarTargetKind; value: string; source: 'manual' | 'sugestao_dna' }) =>
      addRadarTarget(workspaceId, user!.id, vars.kind, vars.value, vars.source),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['radar-targets', workspaceId] })
    },
    onError: (err) => {
      if (err instanceof RadarTargetLimitError || err instanceof RadarTargetDuplicateError) {
        setError(err.message)
      } else {
        setError('Não foi possível adicionar agora. Tente de novo.')
      }
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeRadarTarget(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['radar-targets', workspaceId] }),
  })

  if (!workspaceId) return null

  const byKind = (kind: RadarTargetKind) => (targets ?? []).filter((t) => t.kind === kind)
  const contentStrategy = (typeof profile?.content_strategy === 'object' && profile?.content_strategy ? profile.content_strategy : {}) as {
    priority_themes?: string[]
  }
  const audience = (typeof profile?.audience === 'object' && profile?.audience ? profile.audience : {}) as { interests?: string[] }
  const hasDna = !!(profile?.segment || contentStrategy.priority_themes?.length || audience.interests?.length)

  const busy = addMutation.isPending || removeMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurar o Radar</CardTitle>
        <p className="text-sm text-ink-500">
          {hasDna
            ? 'Sugestões preparadas com base no DNA da sua marca — revise, ajuste e adicione o que fizer sentido.'
            : 'Ainda não temos DNA suficiente para sugerir automaticamente. Você pode adicionar tudo manualmente, ou completar o DNA da marca para receber sugestões.'}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </div>
        )}

        <RadarTargetGroup
          title="Termos do nicho"
          description="Palavras e expressões que descrevem sua área — usadas para cruzar com sinais em alta."
          prefix=""
          selected={byKind('termo')}
          suggestionPool={suggestTerms(profile)}
          emptySuggestionsMessage={hasDna ? undefined : 'Complete o DNA da marca para receber sugestões aqui.'}
          canWrite={canWrite}
          busy={busy}
          manualPlaceholder="Ex.: marketing médico"
          onAdd={(value, source) => addMutation.mutate({ kind: 'termo', value, source })}
          onRemove={(id) => removeMutation.mutate(id)}
        />

        <RadarTargetGroup
          title="Hashtags"
          description="Hashtags relevantes para o seu conteúdo — sem #, adicionamos na hora de mostrar."
          prefix="#"
          selected={byKind('hashtag')}
          suggestionPool={suggestHashtags(profile)}
          emptySuggestionsMessage={hasDna ? undefined : 'Complete o DNA da marca para receber sugestões aqui.'}
          canWrite={canWrite}
          busy={busy}
          manualPlaceholder="Ex.: saudepreventiva"
          onAdd={(value, source) => addMutation.mutate({ kind: 'hashtag', value, source })}
          onRemove={(id) => removeMutation.mutate(id)}
        />

        <RadarTargetGroup
          title="Concorrentes"
          description="Perfis do seu nicho que você quer acompanhar."
          prefix="@"
          selected={byKind('concorrente')}
          suggestionPool={suggestCompetitors(profile)}
          emptySuggestionsMessage="Sugestões automáticas de concorrentes ainda não estão disponíveis neste ambiente (dependem da API oficial de descoberta do Instagram). Adicione @ manualmente por enquanto."
          canWrite={canWrite}
          busy={busy}
          manualPlaceholder="Ex.: @concorrente"
          onAdd={(value, source) => addMutation.mutate({ kind: 'concorrente', value, source })}
          onRemove={(id) => removeMutation.mutate(id)}
        />
      </CardContent>
    </Card>
  )
}
