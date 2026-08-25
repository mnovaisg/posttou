export function ContentEmptyState({
  title,
  description,
  ctaLabel,
  onCreate,
}: {
  title: string
  description: string
  ctaLabel?: string
  onCreate?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-16 text-center dark:border-ink-700 dark:bg-ink-900">
      <span className="mb-3 text-3xl">📭</span>
      <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {ctaLabel ?? '+ Criar meu primeiro conteúdo'}
        </button>
      )}
    </div>
  )
}
