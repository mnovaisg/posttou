import * as React from 'react'
import { Stage, Layer, Rect, Circle, Line, Text as KonvaText, Image as KonvaImage, Transformer } from 'react-konva'
import useImage from 'use-image'
import type Konva from 'konva'
import { getCoverCrop } from '@/features/editor/imageCrop'
import type {
  EditorElement,
  EditorPage,
  ImageElementContent,
  ShapeElementContent,
  ShapeElementStyle,
  TextElementContent,
  TextElementStyle,
} from '@/features/editor/types'

interface CanvasProps {
  page: EditorPage
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChangeLive: (id: string, patch: Partial<EditorElement>) => void
  onCommit: (id: string, patch: Partial<EditorElement>) => void
  onEditText: (id: string) => void
  imageUrls: Record<string, string>
  zoom: number
  containerSize: { width: number; height: number }
}

function ImageNode({ el, imageUrls, common }: { el: EditorElement; imageUrls: Record<string, string>; common: Record<string, unknown> }) {
  const content = el.content as ImageElementContent
  const [img] = useImage(imageUrls[content.path] ?? '', 'anonymous')
  const style = el.style as { opacity: number }
  // "cover" real (nunca esticar): recorta a imagem de origem pra
  // proporção da caixa de destino — mesmo cálculo usado no export PNG e
  // no mesmo espírito do object-fit: cover já usado no Preview.
  const crop = img ? getCoverCrop(img.naturalWidth || img.width, img.naturalHeight || img.height, el.width, el.height) : undefined
  return <KonvaImage image={img} crop={crop} opacity={style.opacity} {...common} />
}

function ShapeNode({ el, common }: { el: EditorElement; common: Record<string, unknown> }) {
  const content = el.content as ShapeElementContent
  const style = el.style as ShapeElementStyle
  if (content.shapeKind === 'circle') {
    return (
      <Circle
        {...common}
        radius={Math.min(el.width, el.height) / 2}
        offsetX={-el.width / 2}
        offsetY={-el.height / 2}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        opacity={style.opacity}
      />
    )
  }
  if (content.shapeKind === 'line') {
    return (
      <Line
        {...common}
        points={[0, el.height / 2, el.width, el.height / 2]}
        stroke={style.fill}
        strokeWidth={Math.max(style.strokeWidth, 4)}
        opacity={style.opacity}
      />
    )
  }
  return <Rect {...common} width={el.width} height={el.height} fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} opacity={style.opacity} />
}

export function Canvas({ page, selectedId, onSelect, onChangeLive, onCommit, onEditText, imageUrls, zoom, containerSize }: CanvasProps) {
  const stageRef = React.useRef<Konva.Stage>(null)
  const transformerRef = React.useRef<Konva.Transformer>(null)
  const nodeRefs = React.useRef<Record<string, Konva.Node | null>>({})

  React.useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    if (selectedId && nodeRefs.current[selectedId]) {
      tr.nodes([nodeRefs.current[selectedId]!])
      tr.getLayer()?.batchDraw()
    } else {
      tr.nodes([])
    }
  }, [selectedId, page.elements])

  const offsetX = (containerSize.width - page.width * zoom) / 2
  const offsetY = (containerSize.height - page.height * zoom) / 2

  const visibleElements = [...page.elements].filter((e) => !e.hidden).sort((a, b) => a.z_index - b.z_index)

  return (
    <Stage
      ref={stageRef}
      width={containerSize.width}
      height={containerSize.height}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null)
      }}
    >
      <Layer x={offsetX} y={offsetY} scaleX={zoom} scaleY={zoom}>
        <Rect x={0} y={0} width={page.width} height={page.height} fill={page.background_color} stroke="#d4d4d8" strokeWidth={1 / zoom} listening={false} />

        {visibleElements.map((el) => {
          const common = {
            id: el.id,
            ref: (node: Konva.Node | null) => {
              nodeRefs.current[el.id] = node
            },
            x: el.position_x,
            y: el.position_y,
            rotation: el.rotation,
            draggable: !el.locked,
            onClick: () => onSelect(el.id),
            onTap: () => onSelect(el.id),
            onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
              onChangeLive(el.id, { position_x: e.target.x(), position_y: e.target.y() })
            },
            onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
              onCommit(el.id, { position_x: e.target.x(), position_y: e.target.y() })
            },
            onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
              const node = e.target
              const scaleX = node.scaleX()
              const scaleY = node.scaleY()
              node.scaleX(1)
              node.scaleY(1)
              onCommit(el.id, {
                position_x: node.x(),
                position_y: node.y(),
                width: Math.max(20, el.width * scaleX),
                height: Math.max(20, el.height * scaleY),
                rotation: node.rotation(),
              })
            },
            onDblClick: () => {
              if (el.type === 'text') onEditText(el.id)
            },
          }

          if (el.type === 'text') {
            const content = el.content as TextElementContent
            const style = el.style as TextElementStyle
            return (
              <KonvaText
                key={el.id}
                {...common}
                width={el.width}
                height={el.height}
                text={content.text}
                fontSize={style.fontSize}
                fontFamily={style.fontFamily}
                fontStyle={`${style.fontWeight >= 600 ? 'bold' : 'normal'} ${style.fontStyle}`}
                align={style.textAlign}
                fill={style.color}
                opacity={style.opacity}
                lineHeight={style.lineHeight}
                letterSpacing={style.letterSpacing}
              />
            )
          }
          if (el.type === 'image') {
            return <ImageNode key={el.id} el={el} imageUrls={imageUrls} common={{ ...common, width: el.width, height: el.height }} />
          }
          return <ShapeNode key={el.id} el={el} common={common} />
        })}

        <Transformer
          ref={transformerRef}
          rotateEnabled
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
        />
      </Layer>
    </Stage>
  )
}
