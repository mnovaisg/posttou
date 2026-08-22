import { useQuery } from '@tanstack/react-query'
import { getBrandAssetSignedUrl } from '@/features/brand-dna/api'

/** Resolve um path do bucket privado brand-assets para uma signed URL, com cache. */
export function useBrandAssetUrl(path: string) {
  return useQuery({
    queryKey: ['brand-asset-url', path],
    queryFn: () => getBrandAssetSignedUrl(path),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  })
}
