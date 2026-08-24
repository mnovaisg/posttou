import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchOrganizationWorkspaces, fetchWorkspaceEntitlements } from '@/features/billing/api'
import {
  cancelInvite,
  changeMemberRole,
  fetchOrganizationInvites,
  fetchOrganizationMembers,
  fetchSeatsUsed,
  inviteMember,
  removeMember,
  resendInvite,
} from '@/features/team/api'
import type { Enums } from '@/types/database'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Visualizador' }
const ROLES: Enums<'workspace_role'>[] = ['owner', 'admin', 'editor', 'viewer']

export function TeamPage() {
  const { activeWorkspace, activeRole } = useWorkspace()
  const queryClient = useQueryClient()
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState<Enums<'workspace_role'>>('editor')
  const [inviteWorkspaceId, setInviteWorkspaceId] = React.useState<string>('')

  const organizationId = activeWorkspace?.organization_id ?? null
  const canManage = activeRole === 'owner' || activeRole === 'admin'

  const workspacesQuery = useQuery({
    queryKey: ['team-org-workspaces', organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchOrganizationWorkspaces(organizationId!),
  })
  const membersQuery = useQuery({
    queryKey: ['team-members', organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchOrganizationMembers(organizationId!),
  })
  const invitesQuery = useQuery({
    queryKey: ['team-invites', organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchOrganizationInvites(organizationId!),
  })
  const seatsQuery = useQuery({
    queryKey: ['team-seats', organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchSeatsUsed(organizationId!),
  })
  const entitlementsQuery = useQuery({
    queryKey: ['billing-entitlements', activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: () => fetchWorkspaceEntitlements(activeWorkspace!.id),
  })

  React.useEffect(() => {
    if (!inviteWorkspaceId && activeWorkspace) setInviteWorkspaceId(activeWorkspace.id)
  }, [activeWorkspace, inviteWorkspaceId])

  const maxMembers = entitlementsQuery.data?.max_members ?? 1
  const seatsUsed = seatsQuery.data ?? 0
  const seatsFull = seatsUsed >= maxMembers

  async function run(action: () => Promise<unknown>, key: string, successMsg?: string) {
    setError(null)
    setNotice(null)
    setBusy(key)
    try {
      await action()
      if (successMsg) setNotice(successMsg)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-invites'] }),
        queryClient.invalidateQueries({ queryKey: ['team-seats'] }),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(null)
    }
  }

  const membersByWorkspace = new Map<string, typeof membersQuery.data>()
  for (const m of membersQuery.data ?? []) {
    const list = membersByWorkspace.get(m.workspace_id) ?? []
    list.push(m)
    membersByWorkspace.set(m.workspace_id, list)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Equipe</h1>
        <p className="mt-1 text-sm text-ink-500">
          {seatsUsed} de {maxMembers} usuário{maxMembers > 1 ? 's' : ''} do plano em uso.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200">
          {notice}
        </div>
      )}

      {canManage && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Convidar</h2>
          {seatsFull && (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
              Limite de usuários do plano atingido. Faça upgrade em Plano e Cobrança para convidar mais gente.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
              placeholder="e-mail@exemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={seatsFull}
            />
            {(workspacesQuery.data?.length ?? 0) > 1 && (
              <select
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
                value={inviteWorkspaceId}
                onChange={(e) => setInviteWorkspaceId(e.target.value)}
              >
                {workspacesQuery.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-950"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Enums<'workspace_role'>)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              disabled={!inviteEmail.trim() || !inviteWorkspaceId || seatsFull || busy === 'invite'}
              onClick={() =>
                run(
                  async () => {
                    const result = await inviteMember(inviteWorkspaceId, inviteEmail.trim(), inviteRole)
                    setInviteEmail('')
                    if (!result.emailSent) {
                      setNotice(
                        'Convite criado. Não conseguimos enviar e-mail automático para esse endereço (já tem conta no POSTTOU) — compartilhe o link manualmente: ' +
                          result.inviteUrl,
                      )
                    } else {
                      setNotice('Convite enviado por e-mail.')
                    }
                  },
                  'invite',
                )
              }
            >
              Convidar
            </button>
          </div>
        </div>
      )}

      {(invitesQuery.data?.filter((i) => i.status === 'pending').length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Convites pendentes</h2>
          <ul className="space-y-2">
            {invitesQuery.data
              ?.filter((i) => i.status === 'pending')
              .map((invite) => (
                <li key={invite.id} className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm dark:border-ink-800">
                  <div>
                    <p className="font-medium text-ink-900 dark:text-ink-50">{invite.email}</p>
                    <p className="text-xs text-ink-500">
                      {invite.workspace_name} · {ROLE_LABEL[invite.role]} · expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <button
                        className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                        disabled={busy === `resend-${invite.id}`}
                        onClick={() => run(() => resendInvite(invite.id), `resend-${invite.id}`, 'Convite reenviado.')}
                      >
                        Reenviar
                      </button>
                      <button
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        disabled={busy === `cancel-${invite.id}`}
                        onClick={() => run(() => cancelInvite(invite.id), `cancel-${invite.id}`, 'Convite cancelado.')}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Membros</h2>
        {[...membersByWorkspace.entries()].map(([wsId, members]) => (
          <div key={wsId} className="mb-4">
            {membersByWorkspace.size > 1 && <p className="mb-2 text-xs font-medium text-ink-400">{members?.[0]?.workspace_name}</p>}
            <ul className="space-y-2">
              {members?.map((m) => (
                <li key={`${m.workspace_id}-${m.user_id}`} className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm dark:border-ink-800">
                  <div>
                    <p className="font-medium text-ink-900 dark:text-ink-50">{m.full_name ?? m.email}</p>
                    <p className="text-xs text-ink-500">{m.email}</p>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-lg border border-ink-200 px-2 py-1 text-xs dark:border-ink-800 dark:bg-ink-950"
                        value={m.role}
                        disabled={busy === `role-${m.user_id}`}
                        onChange={(e) => run(() => changeMemberRole(m.workspace_id, m.user_id, e.target.value as Enums<'workspace_role'>), `role-${m.user_id}`)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        disabled={busy === `remove-${m.user_id}`}
                        onClick={() => {
                          if (window.confirm(`Remover ${m.full_name ?? m.email} deste workspace?`)) {
                            run(() => removeMember(m.workspace_id, m.user_id), `remove-${m.user_id}`, 'Membro removido.')
                          }
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-500">{ROLE_LABEL[m.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
