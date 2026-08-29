/**
 * Etapa 3 — fonte única do cálculo de "cover" (mesmo comportamento visual
 * de CSS object-fit: cover) usado tanto pelo Canvas ao vivo quanto pelo
 * export PNG, pra nunca mais divergirem entre si nem esticar a imagem.
 *
 * Recorta (nunca deforma) a imagem de origem para preencher exatamente a
 * caixa de destino, preservando a proporção real da imagem — o Konva.Image
 * usa o retângulo retornado como `crop` (em pixels da imagem de origem).
 */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function getCoverCrop(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number): CropRect {
  if (!sourceWidth || !sourceHeight || !boxWidth || !boxHeight) {
    return { x: 0, y: 0, width: sourceWidth || 0, height: sourceHeight || 0 }
  }

  const sourceRatio = sourceWidth / sourceHeight
  const boxRatio = boxWidth / boxHeight

  if (sourceRatio > boxRatio) {
    // Imagem mais "larga" que a caixa — corta as laterais.
    const cropWidth = sourceHeight * boxRatio
    return { x: (sourceWidth - cropWidth) / 2, y: 0, width: cropWidth, height: sourceHeight }
  }

  // Imagem mais "alta" que a caixa — corta topo/base.
  const cropHeight = sourceWidth / boxRatio
  return { x: 0, y: (sourceHeight - cropHeight) / 2, width: sourceWidth, height: cropHeight }
}
