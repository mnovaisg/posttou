import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { EditorElement, ImageElementStyle, ShapeElementStyle, TextElementContent, TextElementStyle } from '@/features/editor/types'

const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Courier New', 'Verdana']

export function PropertiesPanel({
  element,
  onChange,
  disabled,
}: {
  element: EditorElement | null
  onChange: (patch: Partial<EditorElement>) => void
  disabled: boolean
}) {
  if (!element) {
    return <p className="p-4 text-sm text-ink-400">Selecione um elemento para editar suas propriedades.</p>
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">X</Label>
          <Input
            type="number"
            disabled={disabled}
            value={Math.round(element.position_x)}
            onChange={(e) => onChange({ position_x: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Y</Label>
          <Input
            type="number"
            disabled={disabled}
            value={Math.round(element.position_y)}
            onChange={(e) => onChange({ position_y: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Largura</Label>
          <Input
            type="number"
            disabled={disabled}
            value={Math.round(element.width)}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Altura</Label>
          <Input
            type="number"
            disabled={disabled}
            value={Math.round(element.height)}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Label className="text-xs">Rotação</Label>
          <Input
            type="number"
            disabled={disabled}
            value={Math.round(element.rotation)}
            onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          />
        </div>
      </div>

      {element.type === 'text' && (
        <TextProperties element={element} onChange={onChange} disabled={disabled} />
      )}
      {element.type === 'image' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Opacidade</Label>
          <Input
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            value={(element.style as ImageElementStyle).opacity}
            onChange={(e) => onChange({ style: { ...(element.style as ImageElementStyle), opacity: Number(e.target.value) } })}
          />
        </div>
      )}
      {element.type === 'shape' && (
        <ShapeProperties element={element} onChange={onChange} disabled={disabled} />
      )}
    </div>
  )
}

function TextProperties({ element, onChange, disabled }: { element: EditorElement; onChange: (patch: Partial<EditorElement>) => void; disabled: boolean }) {
  const content = element.content as TextElementContent
  const style = element.style as TextElementStyle

  return (
    <div className="flex flex-col gap-3 border-t border-ink-200 pt-3 dark:border-ink-700">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Texto</Label>
        <Textarea
          rows={3}
          disabled={disabled}
          value={content.text}
          onChange={(e) => onChange({ content: { text: e.target.value } })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Fonte</Label>
          <Select disabled={disabled} value={style.fontFamily} onChange={(e) => onChange({ style: { ...style, fontFamily: e.target.value } })}>
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Tamanho</Label>
          <Input type="number" disabled={disabled} value={style.fontSize} onChange={(e) => onChange({ style: { ...style, fontSize: Number(e.target.value) } })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Peso</Label>
          <Select disabled={disabled} value={style.fontWeight} onChange={(e) => onChange({ style: { ...style, fontWeight: Number(e.target.value) } })}>
            {[400, 500, 600, 700, 800].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Estilo</Label>
          <Select disabled={disabled} value={style.fontStyle} onChange={(e) => onChange({ style: { ...style, fontStyle: e.target.value as 'normal' | 'italic' } })}>
            <option value="normal">Normal</option>
            <option value="italic">Itálico</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Alinhamento</Label>
          <Select disabled={disabled} value={style.textAlign} onChange={(e) => onChange({ style: { ...style, textAlign: e.target.value as 'left' | 'center' | 'right' } })}>
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cor</Label>
          <input
            type="color"
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-ink-200 dark:border-ink-700"
            value={style.color}
            onChange={(e) => onChange({ style: { ...style, color: e.target.value } })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Espaçamento entre linhas</Label>
          <Input type="number" step={0.1} disabled={disabled} value={style.lineHeight} onChange={(e) => onChange({ style: { ...style, lineHeight: Number(e.target.value) } })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Espaçamento entre letras</Label>
          <Input type="number" disabled={disabled} value={style.letterSpacing} onChange={(e) => onChange({ style: { ...style, letterSpacing: Number(e.target.value) } })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Label className="text-xs">Opacidade</Label>
          <Input type="range" min={0} max={1} step={0.05} disabled={disabled} value={style.opacity} onChange={(e) => onChange({ style: { ...style, opacity: Number(e.target.value) } })} />
        </div>
      </div>
    </div>
  )
}

function ShapeProperties({ element, onChange, disabled }: { element: EditorElement; onChange: (patch: Partial<EditorElement>) => void; disabled: boolean }) {
  const style = element.style as ShapeElementStyle
  return (
    <div className="flex flex-col gap-3 border-t border-ink-200 pt-3 dark:border-ink-700">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cor de preenchimento</Label>
          <input
            type="color"
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-ink-200 dark:border-ink-700"
            value={style.fill}
            onChange={(e) => onChange({ style: { ...style, fill: e.target.value } })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cor da borda</Label>
          <input
            type="color"
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-ink-200 dark:border-ink-700"
            value={style.stroke === 'transparent' ? '#000000' : style.stroke}
            onChange={(e) => onChange({ style: { ...style, stroke: e.target.value } })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Espessura da borda</Label>
          <Input type="number" min={0} disabled={disabled} value={style.strokeWidth} onChange={(e) => onChange({ style: { ...style, strokeWidth: Number(e.target.value) } })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Opacidade</Label>
          <Input type="range" min={0} max={1} step={0.05} disabled={disabled} value={style.opacity} onChange={(e) => onChange({ style: { ...style, opacity: Number(e.target.value) } })} />
        </div>
      </div>
    </div>
  )
}
