import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AiNotConfiguredError, checkImageGeneration, generateImageWithAi } from '@/features/editor/api'

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 45 // ~3min

export function GenerateImageDialog({
  open,
  onOpenChange,
  workspaceId,
  contentId,
  pageId,
  format,
  creditCost,
  onStarted,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  contentId: string
  /** Liga a geração à página via os RPCs/trigger do Piloto — garante que o elemento seja anexado no servidor mesmo se este diálogo for fechado antes de terminar. */
  pageId: string
  format: string
  creditCost: number | null
  /** Chamado assim que a geração é aceita pelo servidor (antes do polling) — usado para marcar a página como "gerando" localmente. */
  onStarted: () => void
  /** Chamado quando a geração termina com sucesso enquanto o diálogo ainda está aberto — apenas um atalho para não esperar o próximo tick da sincronização de fundo; o elemento em si já foi anexado no servidor independente disto. */
  onGenerated: () => void
}) {
  const [prompt, setPrompt] = React.useState('')
  const [phase, setPhase] = React.useState<'idle' | 'starting' | 'processing' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)

  async function handleGenerate() {
    setPhase('starting')
    setError(null)
    try {
      const { generationId } = await generateImageWithAi({ workspaceId, contentId, prompt, format, pageId })
      onStarted()
      setPhase('processing')

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        const result = await checkImageGeneration(generationId)
        if (result.status === 'success' && result.resultAssetPaths[0]) {
          onGenerated()
          onOpenChange(false)
          setPrompt('')
          setPhase('idle')
          return
        }
        if (result.status === 'failed') {
          setError(result.errorMessage ?? 'A geração falhou.')
          setPhase('error')
          return
        }
      }
      setError('A geração está demorando mais que o esperado. Tente novamente em instantes.')
      setPhase('error')
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Erro inesperado.')
      }
      setPhase('error')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !['starting', 'processing'].includes(phase) && onOpenChange(v)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
          <Dialog.Title className="text-lg font-semibold text-ink-900 dark:text-ink-50">Gerar imagem com IA</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-500">
            Descreva a imagem que você quer. Usamos o DNA da marca para guiar o estilo quando fizer sentido.
          </Dialog.Description>

          <div className="mt-4 flex flex-col gap-3">
            <Label htmlFor="imgPrompt">Prompt</Label>
            <Textarea
              id="imgPrompt"
              rows={4}
              value={prompt}
              disabled={phase === 'starting' || phase === 'processing'}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: Foto de produto minimalista, fundo neutro, luz suave, estilo editorial."
            />
            {error && <p className="text-sm text-danger-500">{error}</p>}
            {phase === 'processing' && <p className="text-sm text-ink-500">Gerando… isso pode levar até 1-2 minutos.</p>}

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || phase === 'starting' || phase === 'processing'}
            >
              {phase === 'starting' || phase === 'processing' ? 'Gerando…' : `Gerar${creditCost != null ? ` (${creditCost} créditos)` : ''}`}
            </Button>
          </div>

          {!['starting', 'processing'].includes(phase) && (
            <Dialog.Close asChild>
              <button type="button" className="absolute right-4 top-4 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200" aria-label="Fechar">
                ×
              </button>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
