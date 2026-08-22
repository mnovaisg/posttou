import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { ensureBrandProfile, updateBrandProfile } from '@/features/brand-dna/api'
import { draftFromRow, draftToPatch } from '@/features/brand-dna/state'
import type { BrandDnaDraft } from '@/features/brand-dna/state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { StepBrand } from '@/features/brand-dna/steps/StepBrand'
import { StepAudience } from '@/features/brand-dna/steps/StepAudience'
import { StepStrategy } from '@/features/brand-dna/steps/StepStrategy'
import { StepVoice } from '@/features/brand-dna/steps/StepVoice'
import { StepVisual } from '@/features/brand-dna/steps/StepVisual'
import { StepReview } from '@/features/brand-dna/steps/StepReview'
import { AiAssistDialog } from '@/features/brand-dna/AiAssistDialog'
import { readPendingCreateIdea } from '@/features/instagram-discovery/session-token'

const STEPS = [
  { id: 1, label: 'Marca' },
  { id: 2, label: 'Público' },
  { id: 3, label: 'Conteúdo' },
  { id: 4, label: 'Voz' },
  { id: 5, label: 'Visual' },
  { id: 6, label: 'Revisão' },
] as const

function validateStep(step: number, draft: BrandDnaDraft): string | null {
  if (step === 1) {
    if (!draft.companyName.trim()) return 'Informe o nome da empresa/marca.'
    if (!draft.description.trim()) return 'Descreva sua empresa em algumas frases.'
  }
  return null
}

export function BrandDnaPage() {
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState(1);
  const [draft, setDraft] = React.useState<BrandDnaDraft | null>(null)
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [justCompleted, setJustCompleted] = React.useState(false)

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['brand-profile', activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: () => ensureBrandProfile(activeWorkspace!.id),
  })

  React.useEffect(() => {
    if (profile && !draft) {
      const d = draftFromRow(profile)
      setDraft(d)
      setStep(profile.onboarding_completed_at ? 6 : Math.min(d.onboardingStep, 6))
    }
  }, [profile, draft])

  const saveMutation = useMutation({
    mutationFn: async (opts: { markStep?: number; complete?: boolean }) => {
      if (!activeWorkspace || !draft) throw new Error('Workspace ou rascunho ausente.')
      const patch = draftToPatch(draft)
      if (opts.markStep) patch.onboarding_step = opts.markStep
      if (opts.complete) patch.onboarding_completed_at = new Date().toISOString()
      return updateBrandProfile(activeWorkspace.id, patch)
    },
    onSuccess: (row) => {
      queryClient.setQueryData(['brand-profile', activeWorkspace?.id], row)
    },
  })

  function patchDraft(patch: Partial<BrandDnaDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function goNext() {
    if (!draft) return
    const err = validateStep(step, draft)
    if (err) {
      setValidationError(err)
      return
    }
    setValidationError(null)
    const nextStep = Math.min(step + 1, 6)
    await saveMutation.mutateAsync({ markStep: nextStep })
    setStep(nextStep)
  }

  function goBack() {
    setValidationError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  async function saveAndExit() {
    if (!draft) return
    await saveMutation.mutateAsync({ markStep: step })
  }

  async function finish() {
    if (!draft) return
    await saveMutation.mutateAsync({ markStep: 6, complete: true })

    // Não consome aqui — só decide o destino. Quem lê e limpa é a
    // /criar (AiCreatePage), no momento em que de fato pré-preenche o
    // formulário com a ideia.
    if (readPendingCreateIdea()) {
      navigate('/criar')
      return
    }

    setJustCompleted(true)
  }

  if (workspaceLoading || profileLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (justCompleted) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-ink-200 bg-white p-10 text-center shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <span className="text-4xl">🎉</span>
        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-50">Seu DNA está pronto!</h2>
        <p className="text-sm text-ink-500">
          O POSTTOU já sabe quem é a sua marca. A partir de agora, toda geração de conteúdo vai considerar isso
          automaticamente.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setJustCompleted(false)}>Ver / editar meu DNA</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">DNA da Marca</h1>
        <p className="text-sm text-ink-500">
          Vamos conhecer sua marca para criar conteúdos que realmente pareçam feitos por você.
        </p>
      </div>

      <Stepper current={step} onSelect={(s) => (profile?.onboarding_completed_at || s <= draft.onboardingStep) && setStep(s)} />

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-700 dark:bg-ink-900 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{STEPS[step - 1].label}</h2>
          {step === 1 && <AiAssistDialog draft={draft} onApply={patchDraft} />}
        </div>

        {step === 1 && <StepBrand draft={draft} onChange={patchDraft} />}
        {step === 2 && <StepAudience draft={draft} onChange={patchDraft} />}
        {step === 3 && <StepStrategy draft={draft} onChange={patchDraft} />}
        {step === 4 && <StepVoice draft={draft} onChange={patchDraft} />}
        {step === 5 && <StepVisual draft={draft} onChange={patchDraft} />}
        {step === 6 && <StepReview draft={draft} />}

        {validationError && <p className="mt-4 text-sm text-danger-500">{validationError}</p>}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5 dark:border-ink-800">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 1}>
            Voltar
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={saveAndExit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando…' : 'Salvar e continuar depois'}
            </Button>
            {step < 6 ? (
              <Button type="button" onClick={goNext} disabled={saveMutation.isPending}>
                Avançar
              </Button>
            ) : (
              <Button type="button" onClick={finish} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando…' : 'Concluir DNA da Marca'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stepper({ current, onSelect }: { current: number; onSelect: (step: number) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((s, idx) => (
        <React.Fragment key={s.id}>
          <button
            type="button"
            onClick={() => onSelect(s.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              s.id === current
                ? 'bg-brand-600 text-white'
                : s.id < current
                  ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                  : 'bg-ink-100 text-ink-400 dark:bg-ink-800',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                s.id === current ? 'bg-white/20' : s.id < current ? 'bg-brand-600 text-white' : 'bg-ink-300 dark:bg-ink-600',
              )}
            >
              {s.id < current ? '✓' : s.id}
            </span>
            {s.label}
          </button>
          {idx < STEPS.length - 1 && <span className="h-px w-4 shrink-0 bg-ink-200 dark:bg-ink-700" />}
        </React.Fragment>
      ))}
    </div>
  )
}
