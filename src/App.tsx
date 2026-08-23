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
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ComingSoonPage } from '@/app/ComingSoonPage'
import { NAV_ITEMS } from '@/app/nav-items'
import { BrandDnaPage } from '@/features/brand-dna/BrandDnaPage'
import { VisualDnaPage } from '@/features/brand-visual-dna/VisualDnaPage'
import { ContentPage } from '@/features/content/ContentPage'
import { ContentDetailPage } from '@/features/content/ContentDetailPage'
import { AiCreatePage } from '@/features/ai-generate/AiCreatePage'
import { EditorPage } from '@/features/editor/EditorPage'
import { ConfiguracoesPage } from '@/features/instagram/ConfiguracoesPage'
import { DiscoveryLandingPage } from '@/features/instagram-discovery/DiscoveryLandingPage'
import { RadarPage } from '@/features/radar/RadarPage'
import { PilotPage } from '@/features/pilot/PilotPage'
import { ReportsPage } from '@/features/reports/ReportsPage'

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/descobrir" element={<DiscoveryLandingPage />} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/cadastro" element={<SignupPage />} />
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

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
              <Route path="/dna-da-marca/visual" element={<VisualDnaPage />} />
              <Route path="/conteudo" element={<ContentPage />} />
              <Route path="/conteudo/:id" element={<ContentDetailPage />} />
              <Route path="/conteudo/:id/editor" element={<EditorPage />} />
              <Route path="/criar" element={<AiCreatePage />} />
              <Route path="/radar" element={<RadarPage />} />
              <Route path="/piloto-automatico" element={<PilotPage />} />
              <Route path="/relatorios" element={<ReportsPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
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
  )
}

export default App
