import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createContent } from '@/features/content/api'
import { TYPE_ICON, TYPE_LABEL } from '@/features/content/types'
import type { ContentType } from '@/features/content/types'
import { mapPostgrestFranchiseGateError, type BillingErrorInfo } from '@/lib/billingErrors'

const TYPES: ContentType[] = ['post', 'carrossel', 'reel']

const GENERIC_ERROR: BillingErrorInfo = { message: 'Não foi possível criar o conteúdo.', cta: null }

export function CreateContentDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = React.useState<BillingErrorInfo | null>(null)

  const mutation = useMutation({
    mutationFn: (type: ContentType) => createContent(workspaceId, type),
    onSuccess: (content) => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
      queryClient.invalidateQueries({ queryKey: ['content-summary'] })
      onOpenChange(false)
      navigate(`/conteudo/${content.id}`)
    },
    onError: (err) => {
      setError(mapPostgrestFranchiseGateError(err) ?? GENERIC_ERROR)
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
          <Dialog.Title className="text-lg font-semibold text-ink-900 dark:text-ink-50">
            Criar conteúdo
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-500">
            Escolha o formato para começar. Você poderá editar tudo depois.
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-2">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setError(null)
                  mutation.mutate(type)
                }}
                className="flex items-center gap-3 rounded-lg border border-ink-200 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-ink-700 dark:hover:bg-ink-800"
              >
                <span className="text-2xl">{TYPE_ICON[type]}</span>
                <span className="font-medium text-ink-900 dark:text-ink-50">{TYPE_LABEL[type]}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3">
              <p className="text-sm text-danger-500">{error.message}</p>
              {error.cta && (
                <Link
                  to={error.cta.to}
                  onClick={() => onOpenChange(false)}
                  className="mt-1 inline-block text-sm font-medium text-brand-600 hover:underline"
                >
                  {error.cta.label} →
                </Link>
              )}
            </div>
          )}
          {mutation.isPending && <p className="mt-3 text-sm text-ink-400">Criando…</p>}

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
