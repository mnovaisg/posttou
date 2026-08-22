import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { supabase } from '@/lib/supabase/client'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { BrandDnaDraft } from '@/features/brand-dna/state'

interface AiSuggestions {
  description?: string
  differentiators?: string
  problems_solved?: string
  audience?: { interests?: string[]; needs?: string[]; pains?: string[]; desires?: string[] }
  content_strategy?: { priority_themes?: string[]; objectives?: string[] }
  voice?: { personality_traits?: string[] }
  vocabulary?: { preferred_words?: string[] }
}

function mergeUnique(existing: string[], incoming: string[] | undefined): string[] {
  if (!incoming?.length) return existing
  const set = new Set(existing)
  incoming.forEach((v) => set.add(v))
  return Array.from(set)
}

export function AiAssistDialog({
  draft,
  onApply,
}: {
  draft: BrandDnaDraft
  onApply: (patch: Partial<BrandDnaDraft>) => void
}) {
  const { activeWorkspace } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  const [description, setDescription] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [suggestions, setSuggestions] = React.useState<AiSuggestions | null>(null)

  async function handleGenerate() {
    if (!activeWorkspace || !description.trim()) return
    setLoading(true)
    setError(null)
    setSuggestions(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brand-dna-assist`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workspaceId: activeWorkspace.id, businessDescription: description }),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body.message || body.error || 'Não foi possível gerar sugestões.')
        return
      }
      setSuggestions(body.suggestions)
    } catch {
      setError('Não foi possível conectar ao serviço de IA. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function applyAll() {
    if (!suggestions) return
    onApply({
      description: suggestions.description || draft.description,
      differentiators: suggestions.differentiators || draft.differentiators,
      problemsSolved: suggestions.problems_solved || draft.problemsSolved,
      audience: {
        ...draft.audience,
        interests: mergeUnique(draft.audience.interests, suggestions.audience?.interests),
        needs: mergeUnique(draft.audience.needs, suggestions.audience?.needs),
        pains: mergeUnique(draft.audience.pains, suggestions.audience?.pains),
        desires: mergeUnique(draft.audience.desires, suggestions.audience?.desires),
      },
      contentStrategy: {
        ...draft.contentStrategy,
        priority_themes: mergeUnique(draft.contentStrategy.priority_themes, suggestions.content_strategy?.priority_themes),
        objectives: mergeUnique(
          draft.contentStrategy.objectives,
          suggestions.content_strategy?.objectives as string[] | undefined,
        ) as BrandDnaDraft['contentStrategy']['objectives'],
      },
      voice: {
        ...draft.voice,
        personality_traits: mergeUnique(draft.voice.personality_traits, suggestions.voice?.personality_traits),
      },
      vocabulary: {
        ...draft.vocabulary,
        preferred_words: mergeUnique(draft.vocabulary.preferred_words, suggestions.vocabulary?.preferred_words),
      },
    })
    setOpen(false)
    setSuggestions(null)
    setDescription('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary" size="sm">
          ✨ Preencher com IA
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
          <Dialog.Title className="text-lg font-semibold text-ink-900 dark:text-ink-50">
            Preencher com IA
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-500">
            Descreva sua empresa em poucas frases. A IA vai sugerir preenchimentos — você revisa e decide o que aceitar.
          </Dialog.Description>

          <div className="mt-4 flex flex-col gap-3">
            <Label htmlFor="aiDescription">Descrição do negócio</Label>
            <Textarea
              id="aiDescription"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Somos uma clínica odontológica em São Paulo, atendemos famílias, focamos em atendimento humanizado e ortodontia."
            />
            {error && <p className="text-sm text-danger-500">{error}</p>}

            {!suggestions && (
              <Button type="button" onClick={handleGenerate} disabled={loading || !description.trim()}>
                {loading ? 'Gerando sugestões…' : 'Gerar sugestões (5 créditos)'}
              </Button>
            )}

            {suggestions && (
              <div className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4 text-sm dark:border-ink-700 dark:bg-ink-800">
                <p className="font-medium text-ink-900 dark:text-ink-50">Sugestões geradas:</p>
                {suggestions.description && <p><strong>Descrição:</strong> {suggestions.description}</p>}
                {suggestions.audience?.pains?.length ? (
                  <p><strong>Dores:</strong> {suggestions.audience.pains.join(', ')}</p>
                ) : null}
                {suggestions.content_strategy?.priority_themes?.length ? (
                  <p><strong>Temas:</strong> {suggestions.content_strategy.priority_themes.join(', ')}</p>
                ) : null}
                {suggestions.voice?.personality_traits?.length ? (
                  <p><strong>Personalidade:</strong> {suggestions.voice.personality_traits.join(', ')}</p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={applyAll}>
                    Aplicar sugestões
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestions(null)}>
                    Descartar
                  </Button>
                </div>
                <p className="text-xs text-ink-400">
                  As sugestões foram mescladas com o que você já preencheu — nada foi apagado. Revise cada etapa antes de salvar.
                </p>
              </div>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              aria-label="Fechar"
            >
              ×
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
