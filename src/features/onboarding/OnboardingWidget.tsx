import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { dismissOnboarding, dismissOnboardingStep, fetchOnboardingState } from '@/features/onboarding/api'

interface Step {
  key: string
  label: string
  to: string
  done: boolean
  skippable: boolean
  celebrate?: string
}

export function OnboardingWidget({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-state', workspaceId],
    queryFn: () => fetchOnboardingState(workspaceId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['onboarding-state', workspaceId] })

  if (isLoading || !data || data.onboarding_dismissed) return null

  // Jornada da Fase 14C: DNA -> DNA Visual (opcional) -> primeira postagem
  // (texto+arte, o "momento uau") -> conectar Instagram -> publicar/agendar
  // -> Piloto Automático (opcional).
  const steps: Step[] = [
    { key: 'brand_dna', label: 'Configurar o DNA da marca', to: '/dna-da-marca', done: data.brand_dna_done, skippable: false },
    { key: 'visual_dna', label: 'Configurar o DNA Visual', to: '/dna-da-marca/visual', done: data.visual_dna_done, skippable: true },
    {
      key: 'first_content',
      label: 'Criar sua primeira postagem completa',
      to: '/criar',
      done: data.first_content_done,
      skippable: false,
      celebrate: 'O POSTTOU criou uma postagem completa para você. 🎉',
    },
    { key: 'instagram', label: 'Conectar o Instagram', to: '/configuracoes', done: data.instagram_connected_done, skippable: false },
    { key: 'publish', label: 'Publicar ou agendar essa postagem', to: '/conteudo', done: data.first_publish_done, skippable: false },
    { key: 'pilot', label: 'Conhecer o Piloto Automático', to: '/piloto-automatico', done: data.pilot_active, skippable: true },
  ]

  const visibleSteps = steps.filter((s) => s.done || !data.dismissed_steps.includes(s.key))
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length
  const justCompletedFirstContent = data.first_content_done && !data.first_publish_done

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{allDone ? 'Você concluiu os primeiros passos! 🎉' : 'Primeiros passos'}</CardTitle>
        <button
          className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
          onClick={() => dismissOnboarding(workspaceId).then(invalidate)}
        >
          Ocultar
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-ink-500">
          {doneCount}/{steps.length} concluídos
        </p>
        {justCompletedFirstContent && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200">
            O POSTTOU criou uma postagem completa para você — agora é só conectar o Instagram e publicar.
          </div>
        )}
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
            {!step.done && step.skippable && (
              <button
                className="text-xs text-ink-400 hover:underline"
                onClick={() => dismissOnboardingStep(workspaceId, step.key).then(invalidate)}
              >
                Pular
              </button>
            )}
          </div>
        ))}
        {!allDone && (
          <Button variant="secondary" size="sm" className="mt-1" asChild>
            <Link to={visibleSteps.find((s) => !s.done)?.to ?? '/'}>Continuar</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
