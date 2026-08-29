import Konva from 'konva'
import { getCoverCrop } from '@/features/editor/imageCrop'
import type { EditorElement, EditorPage, ImageElementContent, ShapeElementContent, ShapeElementStyle, TextElementContent, TextElementStyle } from '@/features/editor/types'

/**
 * Exporta uma página em resolução real (page.width x page.height, não o
 * tamanho exibido no editor) via stage.toDataURL do Konva — renderização
 * determinística de canvas, não depende de screenshot do navegador.
 */
export async function exportPageToPng(page: EditorPage, imageUrls: Record<string, string>): Promise<string> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  document.body.appendChild(container)

  try {
    const stage = new Konva.Stage({ container, width: page.width, height: page.height })
    const layer = new Konva.Layer()
    stage.add(layer)

    const bg = new Konva.Rect({ x: 0, y: 0, width: page.width, height: page.height, fill: page.background_color })
    layer.add(bg)

    const visible = [...page.elements].filter((e) => !e.hidden).sort((a, b) => a.z_index - b.z_index)

    for (const el of visible) {
      const node = await buildNode(el, imageUrls)
      if (node) layer.add(node)
    }

    layer.draw()
    return stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 })
  } finally {
    document.body.removeChild(container)
  }
}

async function buildNode(el: EditorElement, imageUrls: Record<string, string>): Promise<Konva.Shape | null> {
  const common = { x: el.position_x, y: el.position_y, rotation: el.rotation }

  if (el.type === 'text') {
    const content = el.content as TextElementContent
    const style = el.style as TextElementStyle
    return new Konva.Text({
      ...common,
      width: el.width,
      height: el.height,
      text: content.text,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontStyle: `${style.fontWeight >= 600 ? 'bold' : 'normal'} ${style.fontStyle}`,
      align: style.textAlign,
      fill: style.color,
      opacity: style.opacity,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    })
  }

  if (el.type === 'image') {
    const content = el.content as ImageElementContent
    const url = imageUrls[content.path]
    if (!url) return null
    const img = await loadImage(url)
    const style = el.style as { opacity: number }
    // Mesmo cálculo de "cover" do Canvas ao vivo (imageCrop.ts) — export
    // e edição precisam sempre renderizar a mesma composição.
    const crop = getCoverCrop(img.naturalWidth, img.naturalHeight, el.width, el.height)
    return new Konva.Image({ ...common, image: img, crop, width: el.width, height: el.height, opacity: style.opacity })
  }

  const content = el.content as ShapeElementContent
  const style = el.style as ShapeElementStyle
  if (content.shapeKind === 'circle') {
    return new Konva.Circle({
      ...common,
      x: el.position_x + el.width / 2,
      y: el.position_y + el.height / 2,
      radius: Math.min(el.width, el.height) / 2,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity,
    })
  }
  if (content.shapeKind === 'line') {
    return new Konva.Line({
      ...common,
      points: [el.position_x, el.position_y + el.height / 2, el.position_x + el.width, el.position_y + el.height / 2],
      stroke: style.fill,
      strokeWidth: Math.max(style.strokeWidth, 4),
      opacity: style.opacity,
    })
  }
  return new Konva.Rect({ ...common, width: el.width, height: el.height, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, opacity: style.opacity })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
