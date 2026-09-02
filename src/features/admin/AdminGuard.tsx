import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { checkIsPlatformAdmin } from '@/features/admin/api'

// Autorização real está 100% no servidor (is_platform_admin, checado de
// novo dentro de cada RPC admin_*_system). Este guard é só UX — impede o
// componente de renderizar para quem não é platform admin, mas mesmo que
// alguém contornasse isto no cliente, toda mutação seria rejeitada pelo
// banco. Nunca decide autorização a partir de localStorage ou do e-mail.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [status, setStatus] = React.useState<'checking' | 'allowed' | 'denied'>('checking')

  React.useEffect(() => {
    if (authLoading) return
    if (!session) {
      setStatus('denied')
      return
    }
    let cancelled = false
    checkIsPlatformAdmin().then((isAdmin) => {
      if (!cancelled) setStatus(isAdmin ? 'allowed' : 'denied')
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, session])

  if (authLoading || status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (status === 'denied') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
