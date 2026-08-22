import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await requestPasswordReset(email)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Verifique seu e-mail">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Se houver uma conta associada a <strong>{email}</strong>, enviamos um link para redefinir sua
          senha.
        </p>
        <Link to="/entrar" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
          Voltar para o login
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link de redefinição para seu e-mail.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
        {error && <p className="text-sm text-danger-500">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        <Link to="/entrar" className="font-medium text-brand-600 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthLayout>
  )
}
