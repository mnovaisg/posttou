export function ComingSoonPage({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-24 text-center dark:border-ink-700 dark:bg-ink-900">
      <span className="mb-4 text-4xl">{icon}</span>
      <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-500">{description}</p>
      <span className="mt-6 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
        Em breve
      </span>
    </div>
  )
}
