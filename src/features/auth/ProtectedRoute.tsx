import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { LandingPage } from '@/features/landing/LandingPage'
import { Spinner } from '@/components/ui/spinner'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 text-brand-600 dark:bg-ink-950">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!session) {
    // Ajuste de Launch Readiness: "/" é o único ponto de entrada que serve
    // dois públicos — visitante anônimo vê a landing comercial pública
    // (sem redirect, sem mudar a URL); qualquer outra rota protegida sem
    // sessão continua indo para /entrar, como sempre. Nenhuma rota nova,
    // nenhum navigate('/') existente muda de comportamento (só rodam
    // autenticados).
    if (location.pathname === '/') {
      return <LandingPage />
    }
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
