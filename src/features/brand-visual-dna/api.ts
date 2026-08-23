import { supabase } from '@/lib/supabase/client'
import type { BrandReferenceRow, BrandVisualDnaRow, VisualDnaOptionRow, VisualDnaOptionSetRow } from '@/features/brand-visual-dna/types'

export async function fetchReferences(workspaceId: string): Promise<BrandReferenceRow[]> {
  const { data, error } = await supabase
    .from('brand_reference_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export interface AddReferenceInput {
  workspaceId: string
  handle: string
  referenceType?: string | null
  likedAspects: string[]
  notes?: string | null
}

export async function addReference(input: AddReferenceInput): Promise<BrandReferenceRow> {
  const { data, error } = await supabase.rpc('add_brand_reference', {
    p_workspace_id: input.workspaceId,
    p_handle: input.handle,
    p_reference_type: input.referenceType ?? undefined,
    p_liked_aspects: input.likedAspects,
    p_notes: input.notes ?? undefined,
  })
  if (error) throw error
  return data as BrandReferenceRow
}

export async function removeReference(referenceId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_brand_reference', { p_reference_id: referenceId })
  if (error) throw error
}

/** Ação separada e explícita — nunca disparada automaticamente ao adicionar. */
export async function analyzeReference(referenceId: string): Promise<{ status: string; message?: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brand-reference-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ referenceId }),
  })
  const body = await res.json()
  if (!res.ok && res.status !== 200) throw new Error(body.message ?? body.error ?? 'Não foi possível analisar esta referência.')
  return body
}

export async function fetchActiveVisualDna(workspaceId: string): Promise<BrandVisualDnaRow | null> {
  const { data, error } = await supabase
    .from('brand_visual_dna')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchLatestOptionSet(workspaceId: string): Promise<VisualDnaOptionSetRow | null> {
  const { data, error } = await supabase
    .from('visual_dna_option_sets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchOptions(optionSetId: string): Promise<VisualDnaOptionRow[]> {
  const { data, error } = await supabase
    .from('visual_dna_options')
    .select('*')
    .eq('option_set_id', optionSetId)
    .order('label', { ascending: true })
  if (error) throw error
  return data ?? []
}

export interface GenerateVisualDnaResponse {
  optionSetId: string
  roundNumber: number
  creditCost: number
  errors: Array<{ label: string; message: string }>
}

export async function generateVisualDna(workspaceId: string): Promise<GenerateVisualDnaResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brand-visual-dna-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Não foi possível iniciar a geração das direções visuais.')
  return body as GenerateVisualDnaResponse
}

export async function syncOptionSet(optionSetId: string): Promise<VisualDnaOptionSetRow> {
  const { data, error } = await supabase.rpc('sync_visual_dna_option_set', { p_option_set_id: optionSetId })
  if (error) throw error
  return data as VisualDnaOptionSetRow
}

export async function confirmOption(optionId: string): Promise<BrandVisualDnaRow> {
  const { data, error } = await supabase.rpc('confirm_visual_dna_option', { p_option_id: optionId })
  if (error) throw error
  return data as BrandVisualDnaRow
}

export async function dismissOptionSet(optionSetId: string, feedback?: string): Promise<VisualDnaOptionSetRow> {
  const { data, error } = await supabase.rpc('dismiss_visual_dna_option_set', { p_option_set_id: optionSetId, p_feedback: feedback ?? undefined })
  if (error) throw error
  return data as VisualDnaOptionSetRow
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function getContentAssetSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('content-assets').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}
