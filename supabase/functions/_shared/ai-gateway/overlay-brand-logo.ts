// Sobrepõe a logo REAL da marca (brand_profiles.logo_path, bucket privado
// brand-assets) na imagem final gerada por IA — nunca pedimos ao modelo de
// imagem pra "desenhar" o nome/logo da marca como texto: modelos de imagem
// não renderizam texto exato de forma confiável (achado real: gerou
// "Postcu" tentando escrever "POSTTOU"). Sem logo cadastrada, é um no-op —
// devolve os bytes exatamente como vieram, sem custo extra.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface OverlayLogoResult {
  bytes: Uint8Array
  applied: boolean
}

// Logo ocupa uma fração pequena e discreta do canto inferior direito —
// nunca cobre o centro da composição, mantém a proporção original da logo
// (nunca deforma).
const LOGO_WIDTH_RATIO = 0.16
const PADDING_RATIO = 0.04

// deno-lint-ignore no-explicit-any
export async function overlayBrandLogo(bytes: Uint8Array, workspaceId: string, admin: SupabaseClient<any>): Promise<OverlayLogoResult> {
  const { data: brandProfile } = await admin.from('brand_profiles').select('logo_path').eq('workspace_id', workspaceId).maybeSingle()

  const logoPath = brandProfile?.logo_path as string | null | undefined
  if (!logoPath) {
    return { bytes, applied: false }
  }

  try {
    const { data: logoFile, error: downloadError } = await admin.storage.from('brand-assets').download(logoPath)
    if (downloadError || !logoFile) {
      console.error('overlayBrandLogo: falha ao baixar a logo do Storage.', downloadError)
      return { bytes, applied: false }
    }
    const logoBytes = new Uint8Array(await logoFile.arrayBuffer())

    const base = await Image.decode(bytes)
    const logo = await Image.decode(logoBytes)

    const targetLogoWidth = Math.max(24, Math.round(base.width * LOGO_WIDTH_RATIO))
    const logoScale = targetLogoWidth / logo.width
    const targetLogoHeight = Math.max(24, Math.round(logo.height * logoScale))
    logo.resize(targetLogoWidth, targetLogoHeight)

    const padding = Math.round(base.width * PADDING_RATIO)
    const offsetX = Math.max(0, base.width - targetLogoWidth - padding)
    const offsetY = Math.max(0, base.height - targetLogoHeight - padding)

    base.composite(logo, offsetX, offsetY)
    const outBytes = await base.encode(2)

    return { bytes: outBytes, applied: true }
  } catch (err) {
    console.error('overlayBrandLogo: falha inesperada ao compor a logo na imagem.', err)
    return { bytes, applied: false }
  }
}
