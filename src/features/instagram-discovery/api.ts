import { supabase } from '@/lib/supabase/client'
import { DISCOVERY_ERROR_MESSAGES } from '@/features/instagram-discovery/types'
import type { ClaimDiscoveryResult, DiscoveryGetResult, DiscoveryStartResult } from '@/features/instagram-discovery/types'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export class DiscoveryNotConfiguredError extends Error {}

/**
 * Inicia a Discovery pública (pré-cadastro). Não exige autenticação — o
 * visitante ainda não tem conta. status:'failed' no corpo (200) é um
 * resultado terminal válido (perfil não encontrado, etc.), não uma
 * exceção — o chamador deve checar result.status.
 */
export async function startDiscovery(handle: string): Promise<DiscoveryStartResult> {
  const res = await fetch(`${FUNCTIONS_URL}/instagram-discovery-public-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  })
  const body = await res.json()
  if (res.status === 501) {
    throw new DiscoveryNotConfiguredError(body.message ?? DISCOVERY_ERROR_MESSAGES.not_configured)
  }
  if (!res.ok) {
    throw new Error(DISCOVERY_ERROR_MESSAGES[body.error as string] ?? body.message ?? 'Não foi possível analisar esse perfil.')
  }
  return body as DiscoveryStartResult
}

/** Reconsulta uma sessão de Discovery pelo token opaco (ex.: após reload da página). */
export async function getDiscoveryStatus(token: string): Promise<DiscoveryGetResult> {
  const res = await fetch(`${FUNCTIONS_URL}/instagram-discovery-public-get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(DISCOVERY_ERROR_MESSAGES[body.error as string] ?? body.message ?? 'Não foi possível consultar essa análise.')
  }
  return body as DiscoveryGetResult
}

/**
 * Vincula (claim) uma sessão de Discovery anônima ao workspace do
 * usuário já autenticado. Requer JWT — o token opaco é lido do
 * sessionStorage pelo chamador e nunca trafega em query string.
 */
export async function claimDiscovery(token: string, workspaceId: string): Promise<ClaimDiscoveryResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${FUNCTIONS_URL}/instagram-discovery-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ token, workspaceId }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(DISCOVERY_ERROR_MESSAGES[body.error as string] ?? body.message ?? 'Não foi possível vincular essa análise à sua conta.')
  }
  return body as ClaimDiscoveryResult
}
