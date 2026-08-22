import { supabase } from '@/lib/supabase/client'
import type { BrandProfileRow } from '@/features/brand-dna/types'
import type { TablesUpdate } from '@/types/database'

export async function fetchBrandProfile(workspaceId: string): Promise<BrandProfileRow | null> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function ensureBrandProfile(workspaceId: string): Promise<BrandProfileRow> {
  const existing = await fetchBrandProfile(workspaceId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('brand_profiles')
    .insert({ workspace_id: workspaceId })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateBrandProfile(
  workspaceId: string,
  patch: TablesUpdate<'brand_profiles'>,
): Promise<BrandProfileRow> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export type BrandAssetKind = 'logo' | 'logo-secundaria' | 'avatar' | 'referencias'

/**
 * Faz upload para o bucket privado "brand-assets" e retorna o PATH do
 * objeto (não uma URL pública — o bucket não é público). Para exibir a
 * imagem, resolva o path com getBrandAssetSignedUrl.
 */
export async function uploadBrandAsset(
  workspaceId: string,
  kind: BrandAssetKind,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${workspaceId}/${kind}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from('brand-assets').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error

  return path
}

/** TTL folgado o suficiente para uma sessão de edição sem re-assinar a cada render. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function getBrandAssetSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from('brand-assets')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}
