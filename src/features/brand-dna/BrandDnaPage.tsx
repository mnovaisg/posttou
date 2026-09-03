import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { KnowYourBrandFlow } from '@/features/brand-dna/KnowYourBrandFlow'
import { readPendingCreateIdea } from '@/features/instagram-discovery/session-token'
import { FirstContentFlow } from '@/features/onboarding/FirstContentFlow'
import { fetchOnboardingState } from '@/features/onboarding/api'
import { peekPendingInstagramHandle } from '@/lib/pendingInstagramHandle'
import type { TablesUpdate } from '@/types/database'

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
  // Ajuste pré-beta: "Conhecer sua marca" (KnowYourBrandFlow) é a etapa
  // inicial real para um workspace em branco — o formulário/wizard vira
  // editor avançado. Só entra em 'wizard' direto quando já existe algo
  // (DNA concluído, retomando um rascunho, ou pré-preenchido pela
  // Discovery pré-cadastro) — nunca pergunta o @ duas vezes nem reseta
  // progresso de workspace existente.
  const [flowStage, setFlowStage] = React.useState<'know_brand' | 'wizard' | null>(null)
  // Ajuste UX — DNA manual: na primeira entrada (sem dado salvo e sem @
  // capturado na landing), mostra duas opções igualmente claras em vez de
  // ir direto para o pedido de @Instagram. Uma vez escolhido "automático",
  // não pergunta de novo nesta sessão de tela.
  const [entryChoiceMade, setEntryChoiceMade] = React.useState(false)
  const [pendingHandlePeek] = React.useState(() => peekPendingInstagramHandle())

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['brand-profile', activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: () => ensureBrandProfile(activeWorkspace!.id),
  })

  const [searchParams] = useSearchParams()
  // Etapa 4A — mesma queryKey usada pelo OnboardingWidget/Dashboard: o
  // React Query já dedupe, nenhuma chamada extra de verdade. Só usada
  // aqui pra decidir se a ponte "conectar Instagram" do onboarding deve
  // reaparecer num reload/reabertura — nunca em memória, sempre a partir
  // do que está persistido (instagram_connected_done, dismissed_steps).
  const { data: onboardingState } = useQuery({
    queryKey: ['onboarding-state', activeWorkspace?.id],
    queryFn: () => fetchOnboardingState(activeWorkspace!.id),
    enabled: !!activeWorkspace && !!profile?.first_content_completed_at,
  })
  const hasInstagramReturnParams = !!(searchParams.get('instagram') || searchParams.get('instagram_error'))
  const showInstagramBridge =
    !!profile?.first_content_completed_at &&
    (hasInstagramReturnParams ||
      (!!onboardingState &&
        !onboardingState.onboarding_dismissed &&
        !onboardingState.instagram_connected_done &&
        !onboardingState.dismissed_steps.includes('instagram')))

  React.useEffect(() => {
    if (profile && !draft) {
      const d = draftFromRow(profile)
      setDraft(d)
      setStep(profile.onboarding_completed_at ? 6 : Math.min(d.onboardingStep, 6))
      // Progresso real no wizard (passou do passo 1 pelo menos uma vez)
      // sempre retoma direto no wizard — nunca reseta um rascunho em
      // andamento. Um perfil só com dados pré-preenchidos por
      // Discovery/claim (onboarding_step ainda em 1, nunca avançado
      // manualmente) é tratado como "ainda não revisado": cai em
      // know_brand, que detecta os dados já existentes e mostra o
      // resumo direto, sem pedir @/descrição de novo.
      const hasRealWizardProgress = (profile.onboarding_step ?? 1) > 1
      setFlowStage(profile.onboarding_completed_at || hasRealWizardProgress ? 'wizard' : 'know_brand')
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

  const knowBrandMutation = useMutation({
    mutationFn: async (opts: { patch: TablesUpdate<'brand_profiles'>; complete: boolean }) => {
      if (!activeWorkspace) throw new Error('Workspace ausente.')
      const patch: TablesUpdate<'brand_profiles'> = { ...opts.patch }
      if (opts.complete) {
        patch.onboarding_completed_at = new Date().toISOString()
        patch.onboarding_step = 6
      }
      return updateBrandProfile(activeWorkspace.id, patch)
    },
    onSuccess: (row, opts) => {
      queryClient.setQueryData(['brand-profile', activeWorkspace?.id], row)
      setDraft(draftFromRow(row))
      if (opts.complete) {
        if (readPendingCreateIdea()) {
          navigate('/criar')
          return
        }
        setJustCompleted(true)
      } else {
        setStep(1)
        setFlowStage('wizard')
      }
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

  if (workspaceLoading || profileLoading || !draft || !flowStage) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const hasKnownBrandData = !!(profile?.company_name?.trim() || profile?.description?.trim())
  const needsEntryChoice =
    flowStage === 'know_brand' && !justCompleted && !hasKnownBrandData && !pendingHandlePeek && !entryChoiceMade

  if (needsEntryChoice) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">DNA da Marca</h1>
          <p className="text-sm text-ink-500">
            Vamos conhecer sua marca para criar conteúdos que realmente pareçam feitos por você. Escolha como
            prefere começar — dá pra editar tudo depois, de qualquer forma.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEntryChoiceMade(true)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-brand-700"
          >
            <span className="text-2xl">✨</span>
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">Criar automaticamente</h2>
            <p className="text-sm text-ink-500">
              Informe o @Instagram da marca (opcional) e deixe a IA sugerir um primeiro DNA. Você revisa e ajusta
              antes de salvar.
            </p>
            <span className="mt-1 text-sm font-medium text-brand-600 dark:text-brand-400">Começar →</span>
          </button>
          <button
            type="button"
            onClick={() => setFlowStage('wizard')}
            className="flex flex-col items-start gap-2 rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-brand-700"
          >
            <span className="text-2xl">📝</span>
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">Criar manualmente</h2>
            <p className="text-sm text-ink-500">
              Prefere preencher você mesmo, passo a passo? Sem precisar de Instagram — você controla cada campo
              desde o início.
            </p>
            <span className="mt-1 text-sm font-medium text-brand-600 dark:text-brand-400">Começar →</span>
          </button>
        </div>
      </div>
    )
  }

  if (flowStage === 'know_brand' && !justCompleted) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">DNA da Marca</h1>
          <p className="text-sm text-ink-500">
            Vamos conhecer sua marca para criar conteúdos que realmente pareçam feitos por você.
          </p>
        </div>
        <KnowYourBrandFlow
          workspaceId={activeWorkspace!.id}
          companyNameFallback={activeWorkspace?.name ?? null}
          existingProfile={profile ?? null}
          onAccept={(patch) => knowBrandMutation.mutate({ patch, complete: true })}
          onReview={(patch) => knowBrandMutation.mutate({ patch, complete: false })}
        />
        <button
          type="button"
          className="self-center text-xs text-ink-400 hover:underline"
          onClick={() => setFlowStage('wizard')}
        >
          Prefiro preencher manualmente
        </button>
      </div>
    )
  }

  if (profile?.onboarding_completed_at && !profile.first_content_completed_at) {
    // Etapa 3 — DNA concluído mas o "primeiro conteúdo automático" ainda
    // não terminou (nunca começou, ou o usuário recarregou/fechou a tela no
    // meio). Condição vem de colunas persistidas (não de estado em memória
    // como `justCompleted`), então funciona igual em qualquer entrada na
    // página — inclusive reload/fechar/reabrir, que é recuperável aqui.
    return (
      <div className="mx-auto max-w-lg">
        <FirstContentFlow workspaceId={activeWorkspace!.id} onDone={() => navigate('/')} />
      </div>
    )
  }

  if (showInstagramBridge) {
    // Etapa 4A — primeiro conteúdo já concluído (first_content_completed_at
    // persistido), mas a ponte de conexão do Instagram ainda não foi
    // resolvida (não conectado, não "fazer isso depois"), OU o navegador
    // acabou de voltar do callback do OAuth (instagram=success/instagram_error
    // na querystring). As duas situações precisam funcionar igual num
    // reload — por isso vêm de estado persistido (onboarding_state) e da
    // própria URL, nunca de estado em memória.
    return (
      <div className="mx-auto max-w-lg">
        <FirstContentFlow workspaceId={activeWorkspace!.id} onDone={() => navigate('/')} startAtConnectInstagram />
      </div>
    )
  }

  if (justCompleted) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-ink-200 bg-white p-10 text-center shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <span className="text-4xl">🎉</span>
        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-50">Seu DNA está pronto!</h2>
        <p className="text-sm text-ink-500">
          O POSTTOU já sabe quem é a sua marca. Agora podemos definir como ela deve parecer visualmente, ou você
          pode ir direto para o seu primeiro conteúdo.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/dna-da-marca/visual')}>Criar meu DNA Visual</Button>
          <Button variant="outline" onClick={() => navigate('/criar')}>
            Pular e criar meu primeiro conteúdo
          </Button>
        </div>
        <button
          className="text-xs text-ink-400 hover:underline"
          onClick={() => setJustCompleted(false)}
        >
          Ver / editar meu DNA
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">DNA da Marca</h1>
          <p className="text-sm text-ink-500">
            Vamos conhecer sua marca para criar conteúdos que realmente pareçam feitos por você.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dna-da-marca/estilo">Estilo da Marca</Link>
        </Button>
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
