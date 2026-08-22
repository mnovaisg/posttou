import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchBrandProfile } from '@/features/brand-dna/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import {
  AiNotConfiguredError,
  fetchCreditBalance,
  fetchOperationCosts,
  generateWithAi,
  saveAiGenerationAsDraft,
} from '@/features/ai-generate/api'
import {
  GENERATION_TYPE_DESCRIPTION,
  GENERATION_TYPE_ICON,
  GENERATION_TYPE_LABEL,
  OBJECTIVE_LABEL,
} from '@/features/ai-generate/types'
import type {
  AiGenerateResponse,
  CarrosselGenerationResult,
  ContentIdea,
  GenerationType,
  IdeasGenerationResult,
  Objective,
  ReelsGenerationResult,
  TextGenerationResult,
} from '@/features/ai-generate/types'
import { clearPendingCreateIdea, readPendingCreateIdea } from '@/features/instagram-discovery/session-token'
import type { DiscoveryIdea } from '@/features/instagram-discovery/types'
import { clearPendingRadarIdea, readPendingRadarIdea } from '@/features/radar/session-token'
import type { PendingRadarIdea } from '@/features/radar/session-token'

const GENERATION_TYPES: GenerationType[] = ['post_unico', 'carrossel', 'reels_roteiro', 'legenda', 'ideias_conteudo']
const OBJECTIVES: Objective[] = ['vender', 'educar', 'autoridade', 'relacionamento', 'leads', 'alcance', 'engajamento', 'divulgar']
const FORMATS = ['1:1', '4:5', '9:16'] as const

function hasCaption(result: unknown): result is TextGenerationResult {
  return !!result && typeof result === 'object' && 'caption' in result
}
function hasSlides(result: unknown): result is CarrosselGenerationResult {
  return hasCaption(result) && 'slides' in result
}
function hasScript(result: unknown): result is ReelsGenerationResult {
  return hasCaption(result) && 'script' in result
}
function hasIdeas(result: unknown): result is IdeasGenerationResult {
  return !!result && typeof result === 'object' && 'ideas' in result
}

export function AiCreatePage() {
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id ?? ''

  const [generationType, setGenerationType] = React.useState<GenerationType | null>(null)
  const [objective, setObjective] = React.useState<Objective | ''>('')
  const [format, setFormat] = React.useState<string>('4:5')
  const [themeInput, setThemeInput] = React.useState('')
  const [response, setResponse] = React.useState<AiGenerateResponse | null>(null)
  const [editedResult, setEditedResult] = React.useState<TextGenerationResult | CarrosselGenerationResult | ReelsGenerationResult | null>(null)
  const [radarOpportunityId, setRadarOpportunityId] = React.useState<string | null>(null)

  const brandProfileQuery = useQuery({
    queryKey: ['brand-profile', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchBrandProfile(workspaceId),
  })
  const brandReady = !!brandProfileQuery.data?.company_name && !!brandProfileQuery.data?.description && !!brandProfileQuery.data?.onboarding_completed_at

  const costsQuery = useQuery({ queryKey: ['ai-operation-costs'], queryFn: fetchOperationCosts })
  const balanceQuery = useQuery({
    queryKey: ['credit-balance', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchCreditBalance(workspaceId),
  })

  const currentCost = generationType && costsQuery.data ? costsQuery.data[generationType] : null
  const insufficientCredits = currentCost != null && balanceQuery.data != null && balanceQuery.data < currentCost

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!generationType) throw new Error('Escolha um tipo de geração.')
      return generateWithAi({
        workspaceId,
        generationType,
        themeInput,
        objective: objective || undefined,
        format: ['post_unico', 'carrossel', 'reels_roteiro'].includes(generationType) ? format : undefined,
      })
    },
    onSuccess: (data) => {
      setResponse(data)
      if (hasCaption(data.result)) setEditedResult(data.result)
      queryClient.invalidateQueries({ queryKey: ['credit-balance', workspaceId] })
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!response || !editedResult || !generationType) throw new Error('Nada para salvar.')
      return saveAiGenerationAsDraft(
        workspaceId,
        response.generationId,
        generationType,
        editedResult,
        themeInput,
        radarOpportunityId ? 'radar' : 'ia',
        radarOpportunityId ?? undefined,
      )
    },
    onSuccess: (content) => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ queryKey: ['content-summary'] })
      navigate(`/conteudo/${content.id}/editor`)
    },
  })

  function resetFlow() {
    setGenerationType(null)
    setObjective('')
    setThemeInput('')
    setResponse(null)
    setEditedResult(null)
    setRadarOpportunityId(null)
    generateMutation.reset()
  }

  function useIdea(idea: ContentIdea) {
    const map: Record<ContentIdea['suggested_type'], GenerationType> = {
      post: 'post_unico',
      carrossel: 'carrossel',
      reel: 'reels_roteiro',
    }
    setGenerationType(map[idea.suggested_type])
    setThemeInput(`${idea.title} — ${idea.description}`)
    setResponse(null)
    setEditedResult(null)
    generateMutation.reset()
  }

  /**
   * Pré-preenche o mesmo formulário do pipeline existente (não um
   * gerador novo) com uma ideia vinda da Discovery — título, gancho,
   * pilar e resumo compõem o "Tema ou intenção"; formato mapeia para o
   * tipo de geração; objetivo só é aplicado se bater com um dos valores
   * conhecidos (nunca força um valor inválido).
   */
  function useDiscoveryIdea(idea: DiscoveryIdea) {
    const map: Record<DiscoveryIdea['formato'], GenerationType> = {
      post: 'post_unico',
      carrossel: 'carrossel',
      reel: 'reels_roteiro',
    }
    setGenerationType(map[idea.formato])
    const matchedObjective = OBJECTIVES.find((o) => idea.objetivo?.toLowerCase().includes(o))
    setObjective(matchedObjective ?? '')
    const parts = [idea.titulo]
    if (idea.gancho) parts.push(`Gancho: ${idea.gancho}`)
    if (idea.pilar) parts.push(`Pilar de conteúdo: ${idea.pilar}`)
    if (idea.resumo) parts.push(idea.resumo)
    setThemeInput(parts.join('\n\n'))
    setResponse(null)
    setEditedResult(null)
    generateMutation.reset()
  }

  /**
   * Mesmo mecanismo de prefill da Discovery (item "integrando com a Fase
   * 4 existente sem pipeline paralelo" da aprovação da Fase 8) — só que
   * a origem vem do Radar Viral. Guarda o opportunityId para rastrear
   * contents.radar_opportunity_id quando o usuário salvar o rascunho.
   */
  function useRadarIdea(idea: PendingRadarIdea) {
    const map: Record<PendingRadarIdea['formato'], GenerationType> = {
      post: 'post_unico',
      carrossel: 'carrossel',
      reel: 'reels_roteiro',
    }
    setGenerationType(map[idea.formato])
    setThemeInput(`${idea.titulo}\n\n${idea.resumo}`)
    setRadarOpportunityId(idea.opportunityId)
    setResponse(null)
    setEditedResult(null)
    generateMutation.reset()
  }

  React.useEffect(() => {
    const pendingRadarIdea = readPendingRadarIdea()
    if (pendingRadarIdea) {
      clearPendingRadarIdea()
      useRadarIdea(pendingRadarIdea)
      return
    }
    const pendingIdea = readPendingCreateIdea()
    if (!pendingIdea) return
    clearPendingCreateIdea()
    useDiscoveryIdea(pendingIdea)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!workspaceId) return null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Criar com IA</h1>
        <p className="mt-1 text-sm text-ink-500">
          A IA usa o DNA da sua marca e o histórico de conteúdo para gerar algo com a sua cara — não genérico.
        </p>
      </div>

      {!brandProfileQuery.isLoading && !brandReady && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Seu DNA da marca ainda não está completo. A IA vai gerar conteúdo mais genérico até você preenchê-lo.
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate('/dna-da-marca')}>
              Completar DNA
            </Button>
          </CardContent>
        </Card>
      )}

      {!response && (
        <>
          <div className="flex flex-col gap-3">
            <Label>O que você quer criar?</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GENERATION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGenerationType(type)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    generationType === type
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                      : 'border-ink-200 hover:border-brand-300 dark:border-ink-700'
                  }`}
                >
                  <span className="text-2xl">{GENERATION_TYPE_ICON[type]}</span>
                  <span>
                    <span className="block font-medium text-ink-900 dark:text-ink-50">{GENERATION_TYPE_LABEL[type]}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">{GENERATION_TYPE_DESCRIPTION[type]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {generationType && (
            <Card>
              <CardContent className="flex flex-col gap-4 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="objective">Objetivo (opcional)</Label>
                    <Select id="objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective | '')}>
                      <option value="">Sem objetivo específico</option>
                      {OBJECTIVES.map((o) => (
                        <option key={o} value={o}>
                          {OBJECTIVE_LABEL[o]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {['post_unico', 'carrossel', 'reels_roteiro'].includes(generationType) && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="format">Formato</Label>
                      <Select id="format" value={format} onChange={(e) => setFormat(e.target.value)}>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="themeInput">Tema ou intenção</Label>
                  <Textarea
                    id="themeInput"
                    rows={4}
                    value={themeInput}
                    onChange={(e) => setThemeInput(e.target.value)}
                    placeholder="Ex.: Lançamento da nova linha de produtos, com foco em sustentabilidade."
                    maxLength={2000}
                  />
                </div>

                {generateMutation.isError && (
                  <p className="text-sm text-danger-500">
                    {generateMutation.error instanceof AiNotConfiguredError
                      ? generateMutation.error.message
                      : generateMutation.error instanceof Error
                        ? generateMutation.error.message
                        : 'Erro inesperado.'}
                  </p>
                )}

                {insufficientCredits && (
                  <p className="text-sm text-danger-500">
                    Créditos insuficientes (custo: {currentCost}, saldo: {balanceQuery.data}).
                  </p>
                )}

                <Button
                  type="button"
                  disabled={!themeInput.trim() || generateMutation.isPending || insufficientCredits}
                  onClick={() => generateMutation.mutate()}
                >
                  {generateMutation.isPending
                    ? 'Gerando…'
                    : `Gerar${currentCost != null ? ` (${currentCost} créditos)` : ''}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {response && hasIdeas(response.result) && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-ink-900 dark:text-ink-50">Ideias geradas</h2>
            <Button size="sm" variant="ghost" onClick={resetFlow}>
              Gerar de novo
            </Button>
          </div>
          {response.result.ideas.map((idea, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-900 dark:text-ink-50">{idea.title}</p>
                    <Badge variant="brand">{idea.suggested_type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{idea.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => useIdea(idea)}>
                  Usar esta ideia
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {response && editedResult && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-ink-900 dark:text-ink-50">Revisar e editar</h2>
              <Button size="sm" variant="ghost" onClick={resetFlow}>
                Descartar
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="caption">Legenda</Label>
              <Textarea
                id="caption"
                rows={6}
                value={editedResult.caption}
                onChange={(e) => setEditedResult({ ...editedResult, caption: e.target.value })}
              />
            </div>

            {hasSlides(editedResult) && (
              <div className="flex flex-col gap-2">
                <Label>Slides ({editedResult.slides.length})</Label>
                {editedResult.slides.map((slide, i) => (
                  <Textarea
                    key={i}
                    rows={2}
                    value={slide}
                    onChange={(e) => {
                      const next = [...editedResult.slides]
                      next[i] = e.target.value
                      setEditedResult({ ...editedResult, slides: next })
                    }}
                  />
                ))}
              </div>
            )}

            {hasScript(editedResult) && (
              <div className="flex flex-col gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                <div className="flex flex-col gap-1">
                  <Label>Gancho</Label>
                  <Textarea
                    rows={2}
                    value={editedResult.script.hook}
                    onChange={(e) => setEditedResult({ ...editedResult, script: { ...editedResult.script, hook: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Desenvolvimento</Label>
                  <Textarea
                    rows={3}
                    value={editedResult.script.development}
                    onChange={(e) => setEditedResult({ ...editedResult, script: { ...editedResult.script, development: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Fechamento</Label>
                  <Textarea
                    rows={2}
                    value={editedResult.script.closing}
                    onChange={(e) => setEditedResult({ ...editedResult, script: { ...editedResult.script, closing: e.target.value } })}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Hashtags</Label>
              <TagInput value={editedResult.hashtags} onChange={(next) => setEditedResult({ ...editedResult, hashtags: next })} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cta">CTA</Label>
              <Textarea
                id="cta"
                rows={2}
                value={editedResult.cta}
                onChange={(e) => setEditedResult({ ...editedResult, cta: e.target.value })}
              />
            </div>

            {saveMutation.isError && (
              <p className="text-sm text-danger-500">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Não foi possível salvar.'}
              </p>
            )}

            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando…' : 'Salvar como rascunho'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
