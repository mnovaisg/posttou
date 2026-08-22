import type { ReactNode } from 'react'
import { PosttouMark } from '@/components/brand/PosttouMark'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <PosttouMark size={48} />
          <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-50">POSTTOU</h1>
          <p className="text-xs text-ink-400">Seu conteúdo. Sua marca. Sua IA.</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-1 text-lg font-semibold text-ink-900 dark:text-ink-50">{title}</h2>
          {subtitle && <p className="mb-5 text-sm text-ink-500">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
