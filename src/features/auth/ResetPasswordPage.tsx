import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function ResetPasswordPage() {
  const { updatePassword, session } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/', { replace: true })
  }

  if (!session) {
    return (
      <AuthLayout title="Link inválido ou expirado">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Abra o link de redefinição de senha enviado ao seu e-mail para continuar.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Nova senha</Label>
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
        {error && <p className="text-sm text-danger-500">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
