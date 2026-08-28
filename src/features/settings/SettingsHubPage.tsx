import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { supabase } from '@/lib/supabase/client'
import { ConnectInstagramCard } from '@/features/instagram/ConnectInstagramCard'
import { exportMyData } from '@/features/settings/api'
import { getSupportEmail } from '@/lib/support'

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsHubPage() {
  const { user, updatePassword, signOut } = useAuth()
  const { activeWorkspace, activeRole } = useWorkspace()
  const supportEmail = getSupportEmail()

  const [fullName, setFullName] = React.useState('')
  const [savingName, setSavingName] = React.useState(false)
  const [nameSaved, setNameSaved] = React.useState(false)
  const [newPassword, setNewPassword] = React.useState('')
  const [passwordStatus, setPasswordStatus] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState('')
  const [deleteStatus, setDeleteStatus] = React.useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ''))
  }, [user])

  async function handleSaveName() {
    if (!user) return
    setSavingName(true)
    setNameSaved(false)
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
    setSavingName(false)
    setNameSaved(true)
  }

  async function handleChangePassword() {
    setPasswordStatus(null)
    const { error } = await updatePassword(newPassword)
    setPasswordStatus(error ?? 'Senha atualizada.')
    if (!error) setNewPassword('')
  }

  async function handleExport() {
    setExporting(true)
    try {
      const data = await exportMyData()
      downloadJson(data, `posttou-meus-dados-${new Date().toISOString().slice(0, 10)}.json`)
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    if (!user) return
    setDeleteBusy(true)
    setDeleteStatus(null)
    try {
      const { data, error } = await supabase.rpc('request_account_deletion', { p_email_confirmation: deleteConfirm })
      if (error) throw error
      const result = data as unknown as { status: string; message: string }
      setDeleteStatus(result.message)
      if (result.status === 'processed_auto') {
        setTimeout(() => signOut(), 2000)
      }
    } catch (err) {
      setDeleteStatus(err instanceof Error ? err.message : 'Não foi possível processar a solicitação.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Configurações</h1>
        <p className="mt-1 text-sm text-ink-500">Conta, marca, equipe e privacidade.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Conta</h2>
        <div className="space-y-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Nome</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <button
                className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={savingName}
                onClick={handleSaveName}
              >
                Salvar
              </button>
            </div>
            {nameSaved && <p className="mt-1 text-xs text-brand-600">Salvo.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">E-mail</label>
            <p className="text-sm text-ink-700 dark:text-ink-200">{user?.email}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Trocar senha</label>
            <div className="flex gap-2">
              <input
                type="password"
                className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
                placeholder="Nova senha"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:hover:bg-ink-800"
                disabled={newPassword.length < 6}
                onClick={handleChangePassword}
              >
                Atualizar
              </button>
            </div>
            {passwordStatus && <p className="mt-1 text-xs text-ink-500">{passwordStatus}</p>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Organização e marca</h2>
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-sm dark:border-ink-800 dark:bg-ink-900">
          <p className="text-ink-700 dark:text-ink-200">Marca ativa: <strong>{activeWorkspace?.name}</strong></p>
          <p className="mt-1 text-xs text-ink-500">Papel: {activeRole}</p>
          <Link to="/dna-da-marca" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
            Ver DNA da Marca
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Equipe</h2>
        <Link
          to="/equipe"
          className="block rounded-xl border border-ink-200 bg-white p-4 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >
          Gerenciar membros e convites →
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Instagram</h2>
        <ConnectInstagramCard />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Plano e cobrança</h2>
        <Link
          to="/plano-e-cobranca"
          className="block rounded-xl border border-ink-200 bg-white p-4 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >
          Ver plano, franquia e cobrança →
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Privacidade</h2>
        <div className="space-y-4 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900 dark:text-ink-50">Exportar meus dados</p>
              <p className="text-xs text-ink-500">Baixe uma cópia dos seus dados pessoais em JSON.</p>
            </div>
            <button
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:hover:bg-ink-800"
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting ? 'Exportando…' : 'Exportar'}
            </button>
          </div>

          <div className="flex gap-4 text-xs text-ink-500">
            <Link to="/politica-de-privacidade" className="font-medium text-brand-600 hover:underline">
              Política de Privacidade
            </Link>
            <Link to="/termos-de-uso" className="font-medium text-brand-600 hover:underline">
              Termos de Uso
            </Link>
          </div>

          <div className="border-t border-ink-100 pt-4 dark:border-ink-800">
            <p className="text-sm font-medium text-red-600">Excluir minha conta</p>
            <p className="mt-1 text-xs text-ink-500">
              Sua conta será anonimizada e o login bloqueado. Dados de workspaces compartilhados são preservados para os
              demais membros. Se você for owner de um workspace com outras pessoas, será necessário falar com o suporte
              antes.
            </p>
            <input
              className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
              placeholder={`Digite ${user?.email} para confirmar`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
            <button
              className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={deleteConfirm !== user?.email || deleteBusy}
              onClick={handleDeleteAccount}
            >
              Excluir conta definitivamente
            </button>
            {deleteStatus && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">{deleteStatus}</p>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Suporte</h2>
        {supportEmail ? (
          <a
            href={`mailto:${supportEmail}`}
            className="block rounded-xl border border-ink-200 bg-white p-4 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
          >
            Falar com o suporte →
          </a>
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Suporte ainda não configurado (defina <code>VITE_SUPPORT_EMAIL</code>).
          </div>
        )}
      </section>
    </div>
  )
}
