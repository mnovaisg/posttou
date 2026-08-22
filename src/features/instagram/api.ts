import { supabase } from '@/lib/supabase/client'
import type { InstagramAccountRow } from '@/features/instagram/types'

// access_token_encrypted nunca tem SELECT concedido a authenticated (só
// service_role) — no PostgREST, select('*') significa literalmente
// "todas as colunas da tabela" e falha inteiro (42501) se qualquer uma
// não tiver grant, mesmo para quem só quer as outras. Por isso listamos
// explicitamente as colunas legíveis pelo frontend em vez de usar '*'.
const READABLE_COLUMNS =
  'id, workspace_id, ig_user_id, username, name, profile_picture_url, status, token_expires_at, connected_by, last_connected_at, disconnected_at, created_at, updated_at'

export async function fetchInstagramAccount(workspaceId: string): Promise<InstagramAccountRow | null> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select(READABLE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .neq('status', 'desconectado')
    .order('last_connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as InstagramAccountRow | null
}

/** Todas as contas conectadas do workspace — usado para deixar o usuário escolher onde publicar (Fase 7, item 22). */
export async function fetchInstagramAccounts(workspaceId: string): Promise<InstagramAccountRow[]> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select(READABLE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('status', 'conectado')
    .order('last_connected_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InstagramAccountRow[]
}

export class InstagramNotConfiguredError extends Error {}

export async function startInstagramOAuth(workspaceId: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId }),
  })
  const body = await res.json()
  if (!res.ok) {
    if (res.status === 501) throw new InstagramNotConfiguredError(body.message ?? 'Conexão com Instagram não configurada.')
    throw new Error(body.error ?? 'Não foi possível iniciar a conexão com o Instagram.')
  }
  return body.authorizeUrl as string
}

export async function disconnectInstagramAccount(workspaceId: string, instagramAccountId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId, instagramAccountId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Não foi possível desconectar o Instagram.')
}
