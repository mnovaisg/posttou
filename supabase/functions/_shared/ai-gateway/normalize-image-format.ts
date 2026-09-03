// Bloco 12.3 — normaliza a proporção real do arquivo retornado pelo
// provider (Kie/gpt4o-image só gera 1:1/3:2/2:3 — nunca 4:5/9:16 nativo)
// para o formato nominal do conteúdo (contents.format / ai_generations.format),
// SEM cortar nem esticar a composição original.
//
// Estratégia ("contain", nunca "cover"): a arte original inteira é
// redesenhada, sem recorte, dentro do canvas final do formato certo,
// centralizada. A faixa que sobra (topo/base pra 4:5 vindo de 2:3;
// esquerda/direita pra 9:16 vindo de 2:3) é preenchida com uma versão
// ampliada e borrada da própria arte — nunca barra sólida, nunca outro
// conteúdo — só pra não deixar a moldura "vazia". O blur é aproximado
// (reduz bem pequeno + suaviza + amplia de novo) porque a lib de imagem
// disponível em Deno (ImageScript, zero-dependência nativa) não tem um
// método de blur pronto — essa aproximação é barata (roda só na versão
// minúscula) e sempre determinística.
//
// Se a proporção já bater com o formato pedido (dentro de uma tolerância
// pequena, cobrindo o 1:1 nativo do provider e pequenas diferenças de
// arredondamento), não reprocessa nada — devolve os bytes originais como
// vieram, sem custo extra.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

export interface NormalizeResult {
  bytes: Uint8Array
  contentType: string
  originalWidth: number
  originalHeight: number
  finalWidth: number
  finalHeight: number
  method: 'unchanged' | 'contain_with_blurred_background'
}

const FORMAT_TARGET: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
}

const RATIO_TOLERANCE = 0.02

function boxBlur3x3InPlace(img: InstanceType<typeof Image>, passes: number) {
  const w = img.width
  const h = img.height
  for (let p = 0; p < passes; p++) {
    const src = Uint8ClampedArray.from(img.bitmap)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= w) continue
            const idx = (ny * w + nx) * 4
            r += src[idx]
            g += src[idx + 1]
            b += src[idx + 2]
            a += src[idx + 3]
            count++
          }
        }
        const idx = (y * w + x) * 4
        img.bitmap[idx] = r / count
        img.bitmap[idx + 1] = g / count
        img.bitmap[idx + 2] = b / count
        img.bitmap[idx + 3] = a / count
      }
    }
  }
}

/**
 * Calcula, no espírito de "contain", as dimensões em que `srcW x srcH`
 * cabe inteiro dentro de `boxW x boxH` sem cortar nem deformar.
 */
function containSize(srcW: number, srcH: number, boxW: number, boxH: number) {
  const srcRatio = srcW / srcH
  const boxRatio = boxW / boxH
  if (srcRatio > boxRatio) {
    // imagem relativamente mais larga que a caixa — encaixa pela largura
    return { width: boxW, height: Math.max(1, Math.round(boxW / srcRatio)) }
  }
  // imagem relativamente mais alta (ou igual) — encaixa pela altura
  return { width: Math.max(1, Math.round(boxH * srcRatio)), height: boxH }
}

export async function normalizeImageForFormat(bytes: Uint8Array, format: string | null | undefined): Promise<NormalizeResult> {
  const target = format ? FORMAT_TARGET[format] : undefined
  if (!target) {
    return { bytes, contentType: 'image/png', originalWidth: 0, originalHeight: 0, finalWidth: 0, finalHeight: 0, method: 'unchanged' }
  }

  const img = await Image.decode(bytes)
  const srcW = img.width
  const srcH = img.height
  const srcRatio = srcW / srcH
  const targetRatio = target.width / target.height

  if (Math.abs(srcRatio - targetRatio) / targetRatio <= RATIO_TOLERANCE) {
    return { bytes, contentType: 'image/png', originalWidth: srcW, originalHeight: srcH, finalWidth: srcW, finalHeight: srcH, method: 'unchanged' }
  }

  // ── Fundo: cover-crop (preenche o canvas todo) + blur aproximado ──
  const bg = img.clone()
  let bgResizeW: number
  let bgResizeH: number
  if (srcRatio > targetRatio) {
    bgResizeH = target.height
    bgResizeW = Math.ceil(target.height * srcRatio)
  } else {
    bgResizeW = target.width
    bgResizeH = Math.ceil(target.width / srcRatio)
  }
  bg.resize(bgResizeW, bgResizeH)
  const cropX = Math.max(0, Math.round((bgResizeW - target.width) / 2))
  const cropY = Math.max(0, Math.round((bgResizeH - target.height) / 2))
  bg.crop(cropX, cropY, target.width, target.height)

  const smallW = Math.max(8, Math.round(target.width / 20))
  const smallH = Math.max(8, Math.round(target.height / 20))
  bg.resize(smallW, smallH)
  boxBlur3x3InPlace(bg, 2)
  bg.resize(target.width, target.height)

  // ── Canvas final: fundo borrado + arte original inteira (contain), centralizada ──
  const canvas = new Image(target.width, target.height)
  canvas.composite(bg, 0, 0)

  const fgSize = containSize(srcW, srcH, target.width, target.height)
  const fg = img.clone().resize(fgSize.width, fgSize.height)
  const offsetX = Math.round((target.width - fgSize.width) / 2)
  const offsetY = Math.round((target.height - fgSize.height) / 2)
  canvas.composite(fg, offsetX, offsetY)

  const outBytes = await canvas.encode(2)

  return {
    bytes: outBytes,
    contentType: 'image/png',
    originalWidth: srcW,
    originalHeight: srcH,
    finalWidth: target.width,
    finalHeight: target.height,
    method: 'contain_with_blurred_background',
  }
}
