import * as React from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { acceptInvite, fetchInvitePreview } from '@/features/team/api'

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof fetchInvitePreview>> | null>(null)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'accepting' | 'accepted' | 'error'>('loading')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Link de convite inválido.')
      return
    }
    fetchInvitePreview(token)
      .then((p) => {
        setPreview(p)
        if (!p.valid) {
          setStatus('error')
          setError('Este convite não existe mais, já foi usado ou expirou.')
        } else {
          setStatus('ready')
        }
      })
      .catch(() => {
        setStatus('error')
        setError('Não foi possível verificar este convite.')
      })
  }, [token])

  async function handleAccept() {
    setStatus('accepting')
    setError(null)
    try {
      await acceptInvite(token)
      setStatus('accepted')
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    }
  }

  if (authLoading || status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">Verificando convite...</div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-50">Convite para o POSTTOU</h1>

        {status === 'error' && (
          <>
            <p className="mt-3 text-sm text-red-600">{error}</p>
            <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
              Ir para o Dashboard
            </Link>
          </>
        )}

        {status === 'accepted' && <p className="mt-3 text-sm text-brand-600">Convite aceito! Redirecionando...</p>}

        {(status === 'ready' || status === 'accepting') && preview?.valid && (
          <>
            <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
              Você foi convidado para <strong>{preview.workspace_name}</strong> ({preview.organization_name}) como <strong>{preview.role}</strong>.
            </p>
            {!user ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-ink-500">Faça login ou crie sua conta com o e-mail {preview.email} para aceitar.</p>
                <Link
                  to="/entrar"
                  state={{ from: `/aceitar-convite?token=${token}` }}
                  className="inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Entrar
                </Link>
              </div>
            ) : user.email?.toLowerCase() !== preview.email?.toLowerCase() ? (
              <p className="mt-4 text-sm text-red-600">
                Você está logado como {user.email}, mas este convite é para {preview.email}. Saia e entre com o e-mail correto.
              </p>
            ) : (
              <button
                className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={status === 'accepting'}
                onClick={handleAccept}
              >
                Aceitar convite
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
