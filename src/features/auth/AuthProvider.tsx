import * as React from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  sessionExpired: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    opts: {
      fullName: string
      workspaceName: string
      discoveryToken?: string | null
      pendingCoupon?: { code: string; planId: string; billingInterval: 'monthly' | 'yearly' } | null
      pendingAttribution?: Record<string, string | undefined> | null
    },
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  clearSessionExpired: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function mapAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (message.includes('User already registered')) return 'Já existe uma conta com este e-mail.'
  if (message.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (message.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [sessionExpired, setSessionExpired] = React.useState(false)
  const hadSessionRef = React.useRef(false)
  const intentionalSignOutRef = React.useRef(false)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      hadSessionRef.current = !!data.session
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' && hadSessionRef.current && !intentionalSignOutRef.current) {
        setSessionExpired(true)
      }
      intentionalSignOutRef.current = false
      setSession(newSession)
      hadSessionRef.current = !!newSession
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = React.useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: mapAuthError(error.message) }

    if (data.session) {
      const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.session.user.id).maybeSingle()
      if (profile?.deleted_at) {
        await supabase.auth.signOut()
        return { error: 'Esta conta foi excluída. Entre em contato com o suporte se isso for um engano.' }
      }
    }

    if (data.session) {
      await supabase.rpc('log_audit_event', {
        p_workspace_id: null as unknown as string,
        p_action: 'login',
        p_resource_type: 'session',
        p_metadata: {},
      })

      if (window.localStorage.getItem('posttou:pending-legal-acceptance') === '1') {
        window.localStorage.removeItem('posttou:pending-legal-acceptance')
        await Promise.all([
          supabase.rpc('record_legal_acceptance', { p_document_type: 'terms_of_service', p_document_version: '2026.08-provisorio' }),
          supabase.rpc('record_legal_acceptance', { p_document_type: 'privacy_policy', p_document_version: '2026.08-provisorio' }),
        ]).catch(() => {})
      }
    }
    return { error: null }
  }, [])

  const signUp = React.useCallback(
    async (
      email: string,
      password: string,
      opts: {
        fullName: string
        workspaceName: string
        discoveryToken?: string | null
        pendingCoupon?: { code: string; planId: string; billingInterval: 'monthly' | 'yearly' } | null
        pendingAttribution?: Record<string, string | undefined> | null
      },
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // discovery_token e pending_coupon viajam em raw_user_meta_data
          // (nunca em URL/query string) especificamente para sobreviver à
          // confirmação de e-mail: o link de confirmação quase sempre abre
          // em outra aba/app, onde sessionStorage já não existe mais.
          // Metadados do usuário acompanham a conta, não o navegador.
          // pending_coupon é só transporte do código — nunca autoridade
          // sobre desconto (isso é revalidado de verdade quando chega no
          // Billing e, com força total, no checkout).
          data: {
            full_name: opts.fullName,
            workspace_name: opts.workspaceName,
            ...(opts.discoveryToken ? { discovery_token: opts.discoveryToken } : {}),
            ...(opts.pendingCoupon ? { pending_coupon: opts.pendingCoupon } : {}),
            ...(opts.pendingAttribution && Object.keys(opts.pendingAttribution).length > 0 ? { pending_attribution: opts.pendingAttribution } : {}),
          },
        },
      })
      if (error) return { error: mapAuthError(error.message) }
      return { error: null }
    },
    [],
  )

  const signOut = React.useCallback(async () => {
    const workspaceId = window.localStorage.getItem('posttou:active-workspace')
    await supabase.rpc('log_audit_event', {
      p_workspace_id: (workspaceId || null) as unknown as string,
      p_action: 'logout',
      p_resource_type: 'session',
      p_metadata: {},
    })
    intentionalSignOutRef.current = true
    await supabase.auth.signOut()
  }, [])

  const requestPasswordReset = React.useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) return { error: mapAuthError(error.message) }
    return { error: null }
  }, [])

  const updatePassword = React.useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: mapAuthError(error.message) }
    return { error: null }
  }, [])

  const clearSessionExpired = React.useCallback(() => setSessionExpired(false), [])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    sessionExpired,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
    clearSessionExpired,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
