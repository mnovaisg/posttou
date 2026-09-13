// ImageScript (lib zero-dependência usada neste gateway) só expõe resize
// nearest-neighbor — sem interpolação, todo resize produz bordas
// serrilhadas (efeito "escada"), visível sobretudo em texto/títulos
// desenhados pela IA. Esta é uma implementação manual de resize bilinear
// (mesma abordagem de manipular img.bitmap diretamente já usada em
// normalize-image-format.ts para o blur) — suaviza as bordas ao
// redimensionar a arte final.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

export function bilinearResize(src: InstanceType<typeof Image>, dstW: number, dstH: number): InstanceType<typeof Image> {
  const srcW = src.width
  const srcH = src.height
  if (dstW === srcW && dstH === srcH) return src.clone()

  const dst = new Image(dstW, dstH)
  const xRatio = srcW / dstW
  const yRatio = srcH / dstH

  for (let y = 0; y < dstH; y++) {
    const srcYf = Math.min(srcH - 1, Math.max(0, (y + 0.5) * yRatio - 0.5))
    const y0 = Math.floor(srcYf)
    const y1 = Math.min(srcH - 1, y0 + 1)
    const wy = srcYf - y0

    for (let x = 0; x < dstW; x++) {
      const srcXf = Math.min(srcW - 1, Math.max(0, (x + 0.5) * xRatio - 0.5))
      const x0 = Math.floor(srcXf)
      const x1 = Math.min(srcW - 1, x0 + 1)
      const wx = srcXf - x0

      const i00 = (y0 * srcW + x0) * 4
      const i10 = (y0 * srcW + x1) * 4
      const i01 = (y1 * srcW + x0) * 4
      const i11 = (y1 * srcW + x1) * 4
      const dstIdx = (y * dstW + x) * 4

      for (let c = 0; c < 4; c++) {
        const top = src.bitmap[i00 + c] * (1 - wx) + src.bitmap[i10 + c] * wx
        const bottom = src.bitmap[i01 + c] * (1 - wx) + src.bitmap[i11 + c] * wx
        dst.bitmap[dstIdx + c] = Math.round(top * (1 - wy) + bottom * wy)
      }
    }
  }

  return dst
}
