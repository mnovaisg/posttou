import * as React from 'react'
import type { BrandDnaDraft } from '@/features/brand-dna/state'
import type { BrandAssetKind } from '@/features/brand-dna/api'
import { uploadBrandAsset } from '@/features/brand-dna/api'
import { useBrandAssetUrl } from '@/features/brand-dna/useBrandAssetUrl'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'

function AssetUploader({
  label,
  kind,
  path,
  onUploaded,
}: {
  label: string
  kind: BrandAssetKind
  path: string
  onUploaded: (path: string) => void
}) {
  const { activeWorkspace } = useWorkspace()
  const { data: signedUrl } = useBrandAssetUrl(path)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFile(file: File) {
    if (!activeWorkspace) return
    setUploading(true)
    setError(null)
    try {
      const uploadedPath = await uploadBrandAsset(activeWorkspace.id, kind, file)
      onUploaded(uploadedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-ink-300 bg-ink-50 dark:border-ink-600 dark:bg-ink-800">
          {signedUrl ? (
            <img src={signedUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-ink-400">sem imagem</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ''
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Enviando…' : path ? 'Trocar imagem' : 'Enviar imagem'}
          </Button>
          {error && <span className="text-xs text-danger-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}

export function StepVisual({
  draft,
  onChange,
}: {
  draft: BrandDnaDraft
  onChange: (patch: Partial<BrandDnaDraft>) => void
}) {
  const visual = draft.visualIdentity

  function patchVisual(p: Partial<BrandDnaDraft['visualIdentity']>) {
    onChange({ visualIdentity: { ...visual, ...p } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <AssetUploader label="Logo principal" kind="logo" path={draft.logoPath} onUploaded={(path) => onChange({ logoPath: path })} />
        <AssetUploader
          label="Logo secundária"
          kind="logo-secundaria"
          path={draft.secondaryLogoPath}
          onUploaded={(path) => onChange({ secondaryLogoPath: path })}
        />
        <AssetUploader label="Foto de perfil" kind="avatar" path={draft.avatarPath} onUploaded={(path) => onChange({ avatarPath: path })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Cores da marca</Label>
        <TagInput
          value={visual.colors}
          onChange={(v) => patchVisual({ colors: v })}
          placeholder="Ex.: #0EA5A5, azul petróleo"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="typography">Tipografia</Label>
          <Input
            id="typography"
            value={visual.typography}
            onChange={(e) => patchVisual({ typography: e.target.value })}
            placeholder="Ex.: Montserrat para títulos, Inter para texto"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visualStyle">Estilo visual</Label>
          <Input
            id="visualStyle"
            value={visual.visual_style}
            onChange={(e) => patchVisual({ visual_style: e.target.value })}
            placeholder="Ex.: minimalista, colorido, editorial"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Referências visuais (links)</Label>
        <TagInput value={visual.references} onChange={(v) => patchVisual({ references: v })} placeholder="Cole um link e pressione Enter" />
      </div>
    </div>
  )
}
