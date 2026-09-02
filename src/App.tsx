import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { AppLayout } from '@/app/AppLayout'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ComingSoonPage } from '@/app/ComingSoonPage'
import { NAV_ITEMS } from '@/app/nav-items'
import { BrandDnaPage } from '@/features/brand-dna/BrandDnaPage'
import { ContentPage } from '@/features/content/ContentPage'
import { ContentDetailPage } from '@/features/content/ContentDetailPage'
import { AiCreatePage } from '@/features/ai-generate/AiCreatePage'
import { SettingsHubPage } from '@/features/settings/SettingsHubPage'
import { DiscoveryLandingPage } from '@/features/instagram-discovery/DiscoveryLandingPage'
import { TeamPage } from '@/features/team/TeamPage'
import { AcceptInvitePage } from '@/features/team/AcceptInvitePage'
import { PrivacyPolicyPage } from '@/features/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from '@/features/legal/TermsOfServicePage'

// Fase 14C — code-splitting das rotas mais pesadas (Editor, Performance,
// Radar, Piloto, Billing, DNA Visual). Cada uma vira seu próprio chunk,
// baixado só quando o usuário realmente navega até ela.
const VisualDnaPage = React.lazy(() => import('@/features/brand-visual-dna/VisualDnaPage').then((m) => ({ default: m.VisualDnaPage })))
const BrandStylePage = React.lazy(() => import('@/features/brand-style/BrandStylePage').then((m) => ({ default: m.BrandStylePage })))
const EditorPage = React.lazy(() => import('@/features/editor/EditorPage').then((m) => ({ default: m.EditorPage })))
const RadarPage = React.lazy(() => import('@/features/radar/RadarPage').then((m) => ({ default: m.RadarPage })))
const PilotPage = React.lazy(() => import('@/features/pilot/PilotPage').then((m) => ({ default: m.PilotPage })))
const ReportsPage = React.lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const BillingPage = React.lazy(() => import('@/features/billing/BillingPage').then((m) => ({ default: m.BillingPage })))

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const COMING_SOON_COPY: Record<string, { icon: string; description: string }> = {}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/descobrir" element={<DiscoveryLandingPage />} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/cadastro" element={<SignupPage />} />
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="/aceitar-convite" element={<AcceptInvitePage />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
            <Route path="/termos-de-uso" element={<TermsOfServicePage />} />

            <Route
              element={
                <ProtectedRoute>
                  <WorkspaceProvider>
                    <AppLayout />
                  </WorkspaceProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="/dna-da-marca" element={<BrandDnaPage />} />
              <Route
                path="/dna-da-marca/visual"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <VisualDnaPage />
                  </React.Suspense>
                }
              />
              <Route
                path="/dna-da-marca/estilo"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <BrandStylePage />
                  </React.Suspense>
                }
              />
              <Route path="/conteudo" element={<ContentPage />} />
              <Route path="/conteudo/:id" element={<ContentDetailPage />} />
              <Route
                path="/conteudo/:id/editor"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <EditorPage />
                  </React.Suspense>
                }
              />
              <Route path="/criar" element={<AiCreatePage />} />
              <Route
                path="/radar"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <RadarPage />
                  </React.Suspense>
                }
              />
              <Route
                path="/piloto-automatico"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <PilotPage />
                  </React.Suspense>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <ReportsPage />
                  </React.Suspense>
                }
              />
              <Route
                path="/plano-e-cobranca"
                element={
                  <React.Suspense fallback={<RouteFallback />}>
                    <BillingPage />
                  </React.Suspense>
                }
              />
              <Route path="/equipe" element={<TeamPage />} />
              <Route path="/configuracoes" element={<SettingsHubPage />} />
              {NAV_ITEMS.filter((item) => !item.implemented).map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={
                    <ComingSoonPage
                      icon={COMING_SOON_COPY[item.path]?.icon ?? '🚧'}
                      title={item.label}
                      description={COMING_SOON_COPY[item.path]?.description ?? 'Em construção.'}
                    />
                  }
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
