import * as React from 'react'
import { Button } from '@/components/ui/button'
import type { ShapeKind } from '@/features/editor/types'

export function Toolbar({
  onAddText,
  onAddShape,
  onUploadClick,
  onGenerateImage,
  disabled,
}: {
  onAddText: () => void
  onAddShape: (kind: ShapeKind) => void
  onUploadClick: (file: File) => void
  onGenerateImage: () => void
  disabled: boolean
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2 p-3">
      <Button size="sm" variant="outline" disabled={disabled} onClick={onAddText} className="justify-start">
        🔤 Texto
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => fileInputRef.current?.click()} className="justify-start">
        🖼️ Upload de imagem
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUploadClick(file)
          e.target.value = ''
        }}
      />
      <Button size="sm" variant="outline" disabled={disabled} onClick={onGenerateImage} className="justify-start">
        ✨ Gerar imagem com IA
      </Button>
      <div className="mt-1 flex flex-col gap-1 border-t border-ink-200 pt-2 dark:border-ink-700">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Formas</p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAddShape('rectangle')}>▭</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAddShape('circle')}>◯</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAddShape('line')}>／</Button>
        </div>
      </div>
    </div>
  )
}
