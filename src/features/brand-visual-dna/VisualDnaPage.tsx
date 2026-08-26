import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { captureException } from '@/lib/observability'
import { GenerationErrorBoundary } from '@/features/brand-visual-dna/GenerationErrorBoundary'
import {
  addReference,
  analyzeReference,
  confirmOption,
  dismissOptionSet,
  fetchActiveVisualDna,
  fetchLatestOptionSet,
  fetchOptions,
  fetchReferences,
  generateVisualDna,
  getContentAssetSignedUrl,
  removeReference,
  syncOptionSet,
} from '@/features/brand-visual-dna/api'
import { LIKED_ASPECTS, VISUAL_DNA_ATTRIBUTE_LABELS, type VisualDnaOptionRow } from '@/features/brand-visual-dna/types'

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  manual: { label: 'Manual (não analisada)', tone: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' },
  analysis_pending: { label: 'Analisando…', tone: 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' },
  analyzed: { label: 'Analisada', tone: 'bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-200' },
  permission_required: { label: 'Sem permissão da Meta', tone: 'bg-warning-100 text-warning-700 dark:bg-warning-900 dark:text-warning-200' },
  unavailable: { label: 'Indisponível para análise', tone: 'bg-danger-100 text-danger-700 dark:bg-danger-900 dark:text-danger-200' },
}

export function VisualDnaPage() {
  const { activeWorkspace, hasRole } = useWorkspace()
  const canEdit = hasRole(['owner', 'admin'])
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id

  const referencesQuery = useQuery({
    queryKey: ['brand-references', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchReferences(workspaceId!),
  })

  const activeDnaQuery = useQuery({
    queryKey: ['brand-visual-dna-active', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchActiveVisualDna(workspaceId!),
  })

  const latestSetQuery = useQuery({
    queryKey: ['visual-dna-latest-set', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchLatestOptionSet(workspaceId!),
  })

  const optionSet = latestSetQuery.data
  const isGenerating = optionSet?.status === 'generating'

  const optionsQuery = useQuery({
    queryKey: ['visual-dna-options', optionSet?.id],
    enabled: !!optionSet?.id && (optionSet.status === 'ready' || optionSet.status === 'generating'),
    queryFn: () => fetchOptions(optionSet!.id),
    refetchInterval: isGenerating ? 3000 : false,
  })

  // Poll o estado da rodada (imagens assíncronas) enquanto "generating".
  // Nunca deixa uma falha de rede/RPC virar rejeição não tratada — só
  // tenta de novo no próximo tick. Sincroniza uma vez imediatamente ao
  // entrar/retornar à tela (sem esperar os 3s do primeiro tick), para
  // refletir na hora um estado que o recovery de backend já resolveu
  // enquanto a aba estava fechada.
  React.useEffect(() => {
    if (!isGenerating || !optionSet) return
    let cancelled = false

    async function runSync() {
      try {
        const updated = await syncOptionSet(optionSet!.id)
        if (cancelled) return
        queryClient.setQueryData(['visual-dna-latest-set', workspaceId], updated)
        if (updated.status !== 'generating') {
          queryClient.invalidateQueries({ queryKey: ['visual-dna-options', optionSet!.id] })
        }
      } catch (err) {
        captureException(err, { area: 'visual_dna_sync_poll', optionSetId: optionSet!.id })
      }
    }

    void runSync()
    const interval = setInterval(runSync, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isGenerating, optionSet, queryClient, workspaceId])

  const generateMutation = useMutation({
    mutationFn: () => generateVisualDna(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visual-dna-latest-set', workspaceId] })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (feedback: string) => dismissOptionSet(optionSet!.id, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visual-dna-latest-set', workspaceId] })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (optionId: string) => confirmOption(optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-visual-dna-active', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['visual-dna-latest-set', workspaceId] })
    },
  })

  const [selectedOption, setSelectedOption] = React.useState<VisualDnaOptionRow | null>(null)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedback, setFeedback] = React.useState('')

  if (!workspaceId) return <Skeleton className="h-96 w-full" />

  const nextRoundNumber = (latestSetQuery.data?.round_number ?? 0) + (isGenerating ? 0 : 1)
  const nextRoundIsFree = nextRoundNumber <= 2

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">DNA Visual & Referências</h1>
        <p className="text-sm text-ink-500">
          Além de quem é sua marca, o POSTTOU também aprende como ela quer aparecer visualmente — e quais perfis
          representam a direção que você admira.
        </p>
      </div>

      {/* ── Referências ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-1 text-lg font-semibold text-ink-900 dark:text-ink-50">Referências de inspiração</h2>
        <p className="mb-4 text-sm text-ink-500">
          Até 5 perfis do Instagram que representam uma direção que você admira. Referências nunca substituem o seu
          DNA — elas só inspiram. Funcionam mesmo sem análise automática.
        </p>

        {referencesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col gap-3">
            {(referencesQuery.data ?? []).map((ref) => (
              <ReferenceCard key={ref.id} reference={ref} canEdit={canEdit} workspaceId={workspaceId} />
            ))}
            {canEdit && (referencesQuery.data?.length ?? 0) < 5 && <AddReferenceForm workspaceId={workspaceId} />}
            {!canEdit && (referencesQuery.data?.length ?? 0) === 0 && (
              <p className="text-sm text-ink-400">Nenhuma referência cadastrada ainda.</p>
            )}
          </div>
        )}
      </section>

      {/* ── DNA Visual confirmado ───────────────────────────────── */}
      {activeDnaQuery.data && (
        <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
          <h2 className="mb-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
            DNA visual atual <span className="text-sm font-normal text-ink-400">(versão {activeDnaQuery.data.version})</span>
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-ink-600 dark:text-ink-300 sm:grid-cols-2">
            {Object.entries((activeDnaQuery.data.attributes as Record<string, string>) ?? {}).map(([key, value]) => (
              <li key={key} className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
                <span className="font-medium text-ink-800 dark:text-ink-100">{VISUAL_DNA_ATTRIBUTE_LABELS[key] ?? key}:</span>{' '}
                {String(value).replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Geração de novas direções ───────────────────────────── */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <h2 className="mb-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
          {activeDnaQuery.data ? 'Gerar novas direções visuais' : 'Escolha sua direção visual'}
        </h2>
        <p className="mb-4 text-sm text-ink-500">
          Geramos 3 direções visuais para o MESMO post — a única coisa que muda entre elas é o tratamento visual
          (nunca o assunto). {nextRoundIsFree ? 'Esta rodada é gratuita.' : 'Esta rodada custa 45 créditos.'}
        </p>

        {!canEdit && <p className="text-sm text-ink-400">Somente owner/admin pode gerar ou confirmar direções visuais.</p>}

        <GenerationErrorBoundary>
          {canEdit && !optionSet && (
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Gerando…' : 'Gerar minhas 3 direções visuais'}
            </Button>
          )}

          {canEdit && optionSet && (optionSet.status === 'dismissed' || optionSet.status === 'failed') && (
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Gerando…' : 'Gerar novamente'}
            </Button>
          )}

          {generateMutation.isError && (
            <p className="mt-2 text-sm text-danger-500">{(generateMutation.error as Error).message}</p>
          )}

          {isGenerating && (
            <div className="flex items-start gap-2 text-sm text-ink-500">
              <span className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-brand-500" />
              <p>
                Gerando suas 3 direções visuais... Isso pode levar alguns minutos. Você pode continuar usando o
                POSTTOU e voltar depois.
              </p>
            </div>
          )}

          {optionSet?.status === 'ready' && optionsQuery.data && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {optionsQuery.data.map((opt) => (
                  <OptionCard
                    key={opt.id}
                    option={opt}
                    selected={selectedOption?.id === opt.id}
                    onSelect={() => setSelectedOption(opt)}
                    canEdit={canEdit}
                  />
                ))}
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFeedbackOpen((v) => !v)}
                  >
                    Nenhum desses
                  </Button>
                  <Button
                    type="button"
                    disabled={!selectedOption || confirmMutation.isPending}
                    onClick={() => selectedOption && confirmMutation.mutate(selectedOption.id)}
                  >
                    {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar direção escolhida'}
                  </Button>
                </div>
              )}

              {feedbackOpen && (
                <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-700">
                  <p className="mb-2 text-sm text-ink-600 dark:text-ink-300">O que não combinou com nenhuma das 3 opções?</p>
                  <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Opcional" />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setFeedbackOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={async () => {
                        await dismissMutation.mutateAsync(feedback)
                        setFeedbackOpen(false)
                        setFeedback('')
                        setSelectedOption(null)
                      }}
                      disabled={dismissMutation.isPending}
                    >
                      Descartar e tentar de novo
                    </Button>
                  </div>
                </div>
              )}

              {confirmMutation.isSuccess && (
                <ConfirmationSummary attributes={(confirmMutation.data.attributes as Record<string, string>) ?? {}} />
              )}
            </div>
          )}
        </GenerationErrorBoundary>
      </section>
    </div>
  )
}

function ConfirmationSummary({ attributes }: { attributes: Record<string, string> }) {
  return (
    <div className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-800 dark:border-success-800 dark:bg-success-950 dark:text-success-200">
      <p className="mb-2 font-medium">DNA visual confirmado! A partir de agora, o Criar com IA vai considerar:</p>
      <ul className="list-inside list-disc space-y-1">
        {Object.entries(attributes).map(([key, value]) => (
          <li key={key}>
            {VISUAL_DNA_ATTRIBUTE_LABELS[key] ?? key}: {String(value).replace(/_/g, ' ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OptionCard({
  option,
  selected,
  onSelect,
  canEdit,
}: {
  option: VisualDnaOptionRow
  selected: boolean
  onSelect: () => void
  canEdit: boolean
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    if (option.preview_asset_path) {
      getContentAssetSignedUrl(option.preview_asset_path).then((url) => {
        if (!cancelled) setImageUrl(url)
      })
    }
    return () => {
      cancelled = true
    }
  }, [option.preview_asset_path])

  return (
    <button
      type="button"
      disabled={!canEdit || option.status !== 'generated'}
      onClick={onSelect}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-ink-200 dark:border-ink-700',
      )}
    >
      <div className="aspect-square w-full bg-ink-100 dark:bg-ink-800">
        {imageUrl ? (
          <img src={imageUrl} alt={`Direção ${option.label}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-400">
            {option.status === 'failed' ? 'Falhou' : 'Gerando…'}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Direção {option.label}</p>
        {option.attributes_summary && <p className="mt-1 text-xs text-ink-500">{option.attributes_summary}</p>}
      </div>
    </button>
  )
}

function ReferenceCard({
  reference,
  canEdit,
  workspaceId,
}: {
  reference: import('@/features/brand-visual-dna/types').BrandReferenceRow
  canEdit: boolean
  workspaceId: string
}) {
  const queryClient = useQueryClient()
  const status = STATUS_LABELS[reference.status] ?? STATUS_LABELS.manual

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeReference(reference.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-references', workspaceId] }),
  })

  const removeMutation = useMutation({
    mutationFn: () => removeReference(reference.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-references', workspaceId] }),
  })

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink-200 p-4 dark:border-ink-700">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900 dark:text-ink-50">@{reference.handle}</p>
          {reference.liked_aspects.length > 0 && (
            <p className="text-xs text-ink-500">
              Admira: {reference.liked_aspects.map((a) => LIKED_ASPECTS.find((la) => la.value === a)?.label ?? a).join(', ')}
            </p>
          )}
        </div>
        <Badge className={status.tone}>{status.label}</Badge>
      </div>

      {canEdit && (
        <div className="flex gap-2">
          {(reference.status === 'manual' || reference.status === 'permission_required' || reference.status === 'unavailable') && (
            <Button size="sm" variant="outline" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
              {analyzeMutation.isPending ? 'Analisando…' : 'Analisar referência'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            Remover
          </Button>
        </div>
      )}
      {analyzeMutation.data?.message && <p className="text-xs text-ink-400">{analyzeMutation.data.message}</p>}
    </div>
  )
}

function AddReferenceForm({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const [handle, setHandle] = React.useState('')
  const [aspects, setAspects] = React.useState<string[]>([])
  const [notes, setNotes] = React.useState('')

  const addMutation = useMutation({
    mutationFn: () => addReference({ workspaceId, handle, likedAspects: aspects, notes: notes || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-references', workspaceId] })
      setHandle('')
      setAspects([])
      setNotes('')
    },
  })

  return (
    <div className="rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-600">
      <div className="flex gap-2">
        <Input placeholder="@perfil_de_referencia" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <Button
          type="button"
          onClick={() => addMutation.mutate()}
          disabled={!handle.trim() || addMutation.isPending}
        >
          {addMutation.isPending ? 'Adicionando…' : 'Adicionar'}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {LIKED_ASPECTS.map((aspect) => (
          <label key={aspect.value} className="flex items-center gap-1.5 text-xs text-ink-600 dark:text-ink-300">
            <input
              type="checkbox"
              checked={aspects.includes(aspect.value)}
              onChange={(e) =>
                setAspects((prev) => (e.target.checked ? [...prev, aspect.value] : prev.filter((a) => a !== aspect.value)))
              }
            />
            {aspect.label}
          </label>
        ))}
      </div>
      <Textarea
        className="mt-2"
        placeholder="O que você admira nesse perfil? (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />
      {addMutation.isError && <p className="mt-1 text-xs text-danger-500">{(addMutation.error as Error).message}</p>}
    </div>
  )
}
