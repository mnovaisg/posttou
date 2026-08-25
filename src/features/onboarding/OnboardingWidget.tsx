import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { dismissOnboarding, dismissOnboardingStep, fetchOnboardingState } from '@/features/onboarding/api'
import type { OnboardingState } from '@/features/onboarding/api'

interface Step {
  key: string
  label: string
  to: string
  done: boolean
  skippable: boolean
  benefit: string
  cta: string
}

// Jornada da Fase 14C, evoluída no ajuste pré-beta: DNA -> DNA Visual
// (opcional) -> primeira postagem (texto+arte, o "momento uau") ->
// conectar Instagram -> publicar/agendar -> Piloto Automático (opcional).
// Cada etapa tem uma explicação curta do benefício e um CTA específico —
// item 5/10 do ajuste: uma decisão principal por vez, sempre com resposta
// clara para "por que estou fazendo isso" e "o que acontece depois".
function buildSteps(data: OnboardingState): Step[] {
  return [
    {
      key: 'brand_dna',
      label: 'Configurar o DNA da marca',
      to: '/dna-da-marca',
      done: data.brand_dna_done,
      skippable: false,
      benefit: 'O POSTTOU usa isso para criar conteúdo com a cara da sua marca, não genérico.',
      cta: 'Criar meu DNA',
    },
    {
      key: 'visual_dna',
      label: 'Definir o estilo visual da marca',
      to: '/dna-da-marca/visual',
      done: data.visual_dna_done,
      skippable: true,
      benefit: 'Recomendado, mas opcional — define como as artes geradas devem parecer.',
      cta: 'Criar meu DNA Visual',
    },
    {
      key: 'first_content',
      label: 'Criar sua primeira postagem completa',
      to: '/criar',
      done: data.first_content_done,
      skippable: false,
      benefit: 'Veja a IA criar texto e arte prontos, usando o DNA que você configurou.',
      cta: 'Criar meu primeiro conteúdo',
    },
    {
      key: 'instagram',
      label: 'Conectar o Instagram',
      to: '/configuracoes',
      done: data.instagram_connected_done,
      skippable: false,
      benefit: 'Necessário para publicar ou agendar direto do POSTTOU.',
      cta: 'Conectar Instagram',
    },
    {
      key: 'publish',
      label: 'Publicar ou agendar essa postagem',
      to: '/conteudo',
      done: data.first_publish_done,
      skippable: false,
      benefit: 'Coloque seu primeiro conteúdo no ar.',
      cta: 'Publicar ou agendar',
    },
    {
      key: 'pilot',
      label: 'Ativar o Piloto Automático',
      to: '/piloto-automatico',
      done: data.pilot_active,
      skippable: true,
      benefit: 'Opcional — deixa o POSTTOU planejando e gerando conteúdo por conta própria.',
      cta: 'Configurar Piloto Automático',
    },
  ]
}

export function OnboardingWidget({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-state', workspaceId],
    queryFn: () => fetchOnboardingState(workspaceId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['onboarding-state', workspaceId] })

  if (isLoading || !data || data.onboarding_dismissed) return null

  const steps = buildSteps(data)
  const visibleSteps = steps.filter((s) => s.done || !data.dismissed_steps.includes(s.key))
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length
  const currentStep = visibleSteps.find((s) => !s.done)
  const justCompletedFirstContent = data.first_content_done && !data.first_publish_done

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{allDone ? 'Seu POSTTOU está configurado 🎉' : 'Configure seu POSTTOU'}</CardTitle>
        <button
          className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
          onClick={() => dismissOnboarding(workspaceId).then(invalidate)}
        >
          Ocultar
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs font-medium text-ink-500">
          {doneCount} de {steps.length} etapas concluídas
        </p>

        {currentStep && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{currentStep.label}</p>
            <p className="mt-1 text-sm text-brand-800 dark:text-brand-200">{currentStep.benefit}</p>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" asChild>
                <Link to={currentStep.to}>{currentStep.cta}</Link>
              </Button>
              {currentStep.skippable && (
                <button
                  className="text-xs text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => dismissOnboardingStep(workspaceId, currentStep.key).then(invalidate)}
                >
                  Pular por enquanto
                </button>
              )}
            </div>
          </div>
        )}

        {justCompletedFirstContent && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200">
            O POSTTOU criou uma postagem completa para você — agora é só conectar o Instagram e publicar.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {visibleSteps.map((step) => (
            <div key={step.key} className="flex items-center gap-2 text-sm">
              <span
                className={
                  step.done
                    ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white'
                    : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-300 dark:border-ink-600'
                }
              >
                {step.done ? '✓' : ''}
              </span>
              {step.done ? (
                <span className="text-ink-400 line-through">{step.label}</span>
              ) : (
                <Link to={step.to} className="flex-1 text-ink-700 hover:text-brand-600 dark:text-ink-200">
                  {step.label}
                </Link>
              )}
              {step.skippable && (
                <span className="text-[10px] uppercase tracking-wide text-ink-400">opcional</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
