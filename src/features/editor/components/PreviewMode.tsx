import * as React from 'react'
import type { EditorPage, ImageElementContent, ShapeElementContent, ShapeElementStyle, TextElementContent, TextElementStyle } from '@/features/editor/types'

/** Visualização somente-leitura, sem controles de edição — CSS puro (sem Konva). */
export function PreviewMode({ pages, imageUrls, onClose }: { pages: EditorPage[]; imageUrls: Record<string, string>; onClose: () => void }) {
  const [index, setIndex] = React.useState(0)
  const page = pages[index]
  if (!page) return null

  const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.75 : 700
  const scale = Math.min(1, maxHeight / page.height, 480 / page.width)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
      <button type="button" onClick={onClose} className="absolute right-6 top-6 text-2xl text-white/80 hover:text-white" aria-label="Fechar">
        ×
      </button>

      <div
        style={{ width: page.width * scale, height: page.height * scale, background: page.background_color }}
        className="relative overflow-hidden rounded-lg shadow-2xl"
      >
        {[...page.elements]
          .filter((e) => !e.hidden)
          .sort((a, b) => a.z_index - b.z_index)
          .map((el) => {
            const base: React.CSSProperties = {
              position: 'absolute',
              left: el.position_x * scale,
              top: el.position_y * scale,
              width: el.width * scale,
              height: el.height * scale,
              transform: `rotate(${el.rotation}deg)`,
              transformOrigin: 'top left',
            }
            if (el.type === 'text') {
              const content = el.content as TextElementContent
              const style = el.style as TextElementStyle
              return (
                <div
                  key={el.id}
                  style={{
                    ...base,
                    fontSize: style.fontSize * scale,
                    fontFamily: style.fontFamily,
                    fontWeight: style.fontWeight,
                    fontStyle: style.fontStyle,
                    textAlign: style.textAlign,
                    color: style.color,
                    opacity: style.opacity,
                    lineHeight: style.lineHeight,
                    letterSpacing: style.letterSpacing,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {content.text}
                </div>
              )
            }
            if (el.type === 'image') {
              const content = el.content as ImageElementContent
              const style = el.style as { opacity: number }
              return <img key={el.id} src={imageUrls[content.path]} style={{ ...base, objectFit: 'cover', opacity: style.opacity }} alt="" />
            }
            const content = el.content as ShapeElementContent
            const style = el.style as ShapeElementStyle
            return (
              <div
                key={el.id}
                style={{
                  ...base,
                  background: content.shapeKind === 'line' ? 'transparent' : style.fill,
                  borderRadius: content.shapeKind === 'circle' ? '9999px' : 0,
                  border: style.strokeWidth ? `${style.strokeWidth * scale}px solid ${style.stroke}` : undefined,
                  borderTop: content.shapeKind === 'line' ? `${Math.max(style.strokeWidth, 4) * scale}px solid ${style.fill}` : undefined,
                  opacity: style.opacity,
                }}
              />
            )
          })}
      </div>

      {pages.length > 1 && (
        <div className="flex items-center gap-4 text-white">
          <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="disabled:opacity-30">‹ Anterior</button>
          <span className="text-sm">{index + 1} / {pages.length}</span>
          <button type="button" disabled={index === pages.length - 1} onClick={() => setIndex((i) => i + 1)} className="disabled:opacity-30">Próxima ›</button>
        </div>
      )}
    </div>
  )
}
