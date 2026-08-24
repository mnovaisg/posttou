import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'

export function SignupPage() {
  const { signUp } = useAuth()
  const [fullName, setFullName] = React.useState('')
  const [workspaceName, setWorkspaceName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [acceptedTerms, setAcceptedTerms] = React.useState(false)
  const [resendStatus, setResendStatus] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleResend() {
    setResendStatus('sending')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setResendStatus(error ? 'error' : 'sent')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!acceptedTerms) {
      setError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.')
      return
    }
    setLoading(true)
    const { error } = await signUp(email, password, {
      fullName,
      workspaceName: workspaceName || `${fullName} — Workspace`,
    })
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    // Registro do aceite fica melhor esforço aqui: nesta etapa ainda não
    // há sessão (confirmação de e-mail pendente) — record_legal_acceptance
    // roda de verdade no primeiro login bem-sucedido (AuthProvider.signIn).
    window.localStorage.setItem('posttou:pending-legal-acceptance', '1')
    setDone(true)
  }

  if (done) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Enviamos um link de confirmação para <strong>{email}</strong>. Abra seu e-mail para ativar a
          conta e acessar o POSTTOU.
        </p>
        <button
          className="mt-4 text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
          disabled={resendStatus === 'sending' || resendStatus === 'sent'}
          onClick={handleResend}
        >
          {resendStatus === 'sent' ? 'E-mail reenviado.' : resendStatus === 'sending' ? 'Reenviando…' : 'Não recebeu? Reenviar e-mail'}
        </button>
        {resendStatus === 'error' && <p className="mt-1 text-xs text-danger-500">Não foi possível reenviar agora. Tente de novo em instantes.</p>}
        <Link to="/entrar" className="mt-6 block text-sm font-medium text-brand-600 hover:underline">
          Voltar para o login
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Comece a transformar suas ideias em conteúdo.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Seu nome</Label>
          <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspaceName">Nome da empresa/marca</Label>
          <Input
            id="workspaceName"
            placeholder="Ex.: Minha Empresa"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-ink-500">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            Li e aceito os{' '}
            <Link to="/termos-de-uso" target="_blank" className="font-medium text-brand-600 hover:underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link to="/politica-de-privacidade" target="_blank" className="font-medium text-brand-600 hover:underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {error && <p className="text-sm text-danger-500">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-medium text-brand-600 hover:underline">
          Entrar
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-400">
        Ainda não sabe seu DNA de marca?{' '}
        <Link to="/descobrir" className="font-medium text-brand-600 hover:underline">
          Descubra em segundos
        </Link>
      </p>
    </AuthLayout>
  )
}
