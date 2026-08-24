import { supabase } from '@/lib/supabase/client'
import type { Enums } from '@/types/database'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return { Authorization: `Bearer ${token}` }
}

export interface OrganizationMember {
  workspace_id: string
  workspace_name: string
  user_id: string
  email: string
  full_name: string | null
  role: Enums<'workspace_role'>
  member_since: string
}

export interface OrganizationInvite {
  id: string
  workspace_id: string
  workspace_name: string
  email: string
  role: Enums<'workspace_role'>
  status: string
  expires_at: string
  created_at: string
  invited_by_name: string | null
}

export async function fetchOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const { data, error } = await supabase.rpc('list_organization_members', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? []
}

export async function fetchOrganizationInvites(organizationId: string): Promise<OrganizationInvite[]> {
  const { data, error } = await supabase.rpc('list_organization_invites', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? []
}

export async function fetchSeatsUsed(organizationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_organization_seats_used', { p_organization_id: organizationId })
  if (error) throw error
  return data ?? 0
}

export async function inviteMember(workspaceId: string, email: string, role: Enums<'workspace_role'>) {
  const headers = await authHeader()
  const res = await fetch(`${FUNCTIONS_URL}/team-invite-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ workspaceId, email, role, appUrl: window.location.origin }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Não foi possível enviar o convite.')
  return body as { inviteId: string; inviteUrl: string; emailSent: boolean; emailSkippedReason: string | null }
}

export async function resendInvite(inviteId: string) {
  const { data, error } = await supabase.rpc('resend_organization_invite', { p_invite_id: inviteId })
  if (error) throw error
  return data
}

export async function cancelInvite(inviteId: string) {
  const { error } = await supabase.rpc('cancel_organization_invite', { p_invite_id: inviteId })
  if (error) throw error
}

export async function changeMemberRole(workspaceId: string, userId: string, newRole: Enums<'workspace_role'>) {
  const { error } = await supabase.rpc('change_member_role', { p_workspace_id: workspaceId, p_user_id: userId, p_new_role: newRole })
  if (error) throw error
}

export async function removeMember(workspaceId: string, userId: string) {
  const { error } = await supabase.rpc('remove_organization_member', { p_workspace_id: workspaceId, p_user_id: userId })
  if (error) throw error
}

export async function fetchInvitePreview(token: string) {
  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })
  if (error) throw error
  return data as { valid: boolean; email?: string; role?: string; workspace_name?: string; organization_name?: string }
}

export async function acceptInvite(token: string) {
  const { data, error } = await supabase.rpc('accept_organization_invite', { p_token: token })
  if (error) throw error
  return data as { workspace_id: string; organization_id: string; role: string }
}
