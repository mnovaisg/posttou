import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const STEPS = [
  { title: 'Ligue ou desligue quando quiser', body: 'O toggle no topo controla o Piloto. Desligado, nada é gerado — nada muda até você ligar.' },
  { title: 'Monte sua agenda semanal', body: 'Escolha os dias e horários em que o Piloto deve preparar conteúdo. Cada horário é 1 conteúdo — adicione uma diretriz se quiser guiar o tema.' },
  { title: 'Escolha como aprovar', body: '"Sempre aguardar minha aprovação" mantém tudo em revisão até você decidir. Desligado, o Piloto tenta publicar sozinho — só quando todos os requisitos permitirem.' },
]

function storageKey(workspaceId: string) {
  return `posttou_pilot_tour_seen_${workspaceId}`
}

export function PilotTour({ workspaceId }: { workspaceId: string }) {
  const [step, setStep] = React.useState(0)
  const [dismissed, setDismissed] = React.useState(true)

  React.useEffect(() => {
    if (!workspaceId) return
    try {
      const seen = window.localStorage.getItem(storageKey(workspaceId))
      setDismissed(!!seen)
    } catch {
      setDismissed(false)
    }
  }, [workspaceId])

  function close() {
    setDismissed(true)
    try {
      window.localStorage.setItem(storageKey(workspaceId), '1')
    } catch {
      // localStorage indisponível (modo privado etc.) — só não persiste, não quebra o tour.
    }
  }

  if (dismissed) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <Card className="border-brand-200 dark:border-brand-800">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-brand-600 dark:text-brand-300">
              {step + 1}/{STEPS.length}
            </p>
            <p className="font-medium text-ink-900 dark:text-ink-50">{current.title}</p>
          </div>
          <button type="button" onClick={close} className="text-ink-400 hover:text-ink-600" aria-label="Fechar tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-ink-500">{current.body}</p>
        <div className="flex justify-end gap-2">
          {step > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </Button>
          )}
          <Button size="sm" onClick={() => (isLast ? close() : setStep((s) => s + 1))}>
            {isLast ? 'Concluir' : 'Avançar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
