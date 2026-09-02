import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BRAND_ASSET_CATEGORY_LABEL,
  deleteBrandAsset,
  getBrandLibraryAssetUrl,
  listBrandAssets,
  uploadBrandLibraryAsset,
} from '@/features/brand-style/api'
import type { BrandAssetCategory, BrandAssetRow } from '@/features/brand-style/api'

const CATEGORIES: BrandAssetCategory[] = ['foto', 'produto', 'pessoa', 'ambiente', 'logo', 'outro']

function LibraryThumb({ asset, onDelete, canWrite }: { asset: BrandAssetRow; onDelete: () => void; canWrite: boolean }) {
  const { data: url } = useQuery({
    queryKey: ['brand-library-url', asset.storage_path],
    queryFn: () => getBrandLibraryAssetUrl(asset.storage_path),
    staleTime: 50 * 60 * 1000,
  })
  const isImage = (asset.mime_type ?? '').startsWith('image/')

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900">
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-ink-100 dark:bg-ink-800">
        {isImage && url ? (
          <img src={url} alt={asset.title ?? ''} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-ink-400">sem preview</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-xs font-medium text-ink-700 dark:text-ink-200">
          {BRAND_ASSET_CATEGORY_LABEL[asset.category as BrandAssetCategory] ?? asset.category}
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            aria-label="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export function BrandLibrary({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [category, setCategory] = React.useState<BrandAssetCategory>('foto')
  const [error, setError] = React.useState<string | null>(null)

  const { data: assets, isLoading } = useQuery({
    queryKey: ['brand-assets', workspaceId],
    queryFn: () => listBrandAssets(workspaceId),
    enabled: !!workspaceId,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadBrandLibraryAsset(workspaceId, user!.id, category, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-assets', workspaceId] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (asset: BrandAssetRow) => deleteBrandAsset(asset),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-assets', workspaceId] }),
  })

  function handleFile(file: File) {
    setError(null)
    if (file.size > 10 * 1024 * 1024) {
      setError('Arquivo maior que 10MB — envie um arquivo menor.')
      return
    }
    uploadMutation.mutate(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value as BrandAssetCategory)} className="w-auto">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {BRAND_ASSET_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploadMutation.isPending ? 'Enviando…' : 'Adicionar arquivo'}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger-500">{error}</p>}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      ) : assets && assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assets.map((asset) => (
            <LibraryThumb key={asset.id} asset={asset} canWrite={canWrite} onDelete={() => deleteMutation.mutate(asset)} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-ink-300 p-6 text-center text-sm text-ink-400 dark:border-ink-700">
          Nenhum material ainda. Adicione fotos, produtos, pessoas, ambientes ou outros assets da sua marca.
        </p>
      )}
    </div>
  )
}
