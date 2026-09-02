import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type BrandAssetRow = Tables<'brand_assets'>
export type BrandAssetCategory = 'foto' | 'produto' | 'pessoa' | 'ambiente' | 'logo' | 'outro'

export const BRAND_ASSET_CATEGORY_LABEL: Record<BrandAssetCategory, string> = {
  foto: 'Foto',
  produto: 'Produto',
  pessoa: 'Pessoa',
  ambiente: 'Ambiente',
  logo: 'Logo',
  outro: 'Outro',
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function listBrandAssets(workspaceId: string): Promise<BrandAssetRow[]> {
  const { data, error } = await supabase
    .from('brand_assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Upload de item da Biblioteca da Marca — reaproveita o mesmo bucket
 * privado `brand-assets` já usado por logo/avatar (nenhum bucket novo),
 * só numa pasta própria (`library/{category}`) para não colidir com os
 * kinds do wizard (logo/logo-secundaria/avatar/referencias).
 */
export async function uploadBrandLibraryAsset(
  workspaceId: string,
  userId: string,
  category: BrandAssetCategory,
  file: File,
  title?: string,
): Promise<BrandAssetRow> {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${workspaceId}/library/${category}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('brand-assets').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('brand_assets')
    .insert({
      workspace_id: workspaceId,
      category,
      title: title || null,
      storage_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    // Linha não gravou — remove o arquivo órfão do storage para não vazar espaço sem registro navegável.
    await supabase.storage.from('brand-assets').remove([path]).catch(() => {})
    throw error
  }

  return data
}

export async function deleteBrandAsset(asset: BrandAssetRow): Promise<void> {
  const { error: dbError } = await supabase.from('brand_assets').delete().eq('id', asset.id)
  if (dbError) throw dbError
  await supabase.storage.from('brand-assets').remove([asset.storage_path]).catch(() => {})
}

export async function getBrandLibraryAssetUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('brand-assets').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}
