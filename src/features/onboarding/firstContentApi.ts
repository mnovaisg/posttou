import { supabase } from '@/lib/supabase/client'
import type { ContentRow } from '@/features/content/types'

/**
 * Etapa 3 — reload/fechar/reabrir durante a geração precisa continuar
 * recuperável: em vez de guardar estado em sessionStorage, simplesmente
 * verifica se o workspace já tem algum conteúdo criado pelo próprio
 * onboarding (origin='ia', o único jeito de content existir tão cedo) e
 * retoma dali, usando o mesmo estado real já persistido no banco.
 */
export async function fetchOnboardingFirstContent(workspaceId: string): Promise<ContentRow | null> {
  const { data, error } = await supabase
    .from('contents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('origin', 'ia')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

const CLAIM_STALE_MS = 2 * 60 * 1000 // 2 min — reload/crash real no meio da criação libera retry

/**
 * Etapa 3 — idempotência real (banco, não frontend) contra clique duplo em
 * "Criar este conteúdo" ou refresh durante a criação. UPDATE condicional
 * atômico: só afeta a linha se first_content_started_at estiver nulo ou
 * "velho" (claim abandonada). Duas chamadas quase simultâneas nunca
 * conseguem as duas afetar a linha — o Postgres serializa o UPDATE, então
 * só uma vê `data.length > 0`. A perdedora deve recuar (nunca criar
 * conteúdo novo) e tentar reaproveitar o que a vencedora está criando via
 * fetchOnboardingFirstContent.
 */
export async function claimFirstContentGeneration(workspaceId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data, error } = await supabase
    .from('brand_profiles')
    .update({ first_content_started_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .or(`first_content_started_at.is.null,first_content_started_at.lt.${staleBefore}`)
    .select('workspace_id')
  if (error) throw error
  return !!data?.length
}

/** Libera a claim (ex.: geração falhou de verdade) para permitir um novo clique imediato. */
export async function releaseFirstContentGeneration(workspaceId: string): Promise<void> {
  await supabase.from('brand_profiles').update({ first_content_started_at: null }).eq('workspace_id', workspaceId)
}

export interface VisualDnaInterpretResponse {
  attributes: Record<string, string>
  attributesSummary: string | null
}

export class AiNotConfiguredError extends Error {}

/** Etapa 3, Decisão 2 (Opção A) — interpreta a arte já criada, sem gerar imagem nova. */
export async function interpretVisualDnaFromContent(params: {
  workspaceId: string
  contentContext: string
  contentId?: string
}): Promise<VisualDnaInterpretResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brand-visual-dna-interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const body = await res.json()
  if (!res.ok) {
    if (res.status === 501) throw new AiNotConfiguredError(body.message ?? 'Interpretação da direção visual não configurada.')
    throw new Error(body.error ?? 'Não foi possível interpretar a direção visual agora.')
  }
  return body as VisualDnaInterpretResponse
}
