import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { ensureBrandProfile, updateBrandProfile, uploadBrandAsset } from '@/features/brand-dna/api'
import { useBrandAssetUrl } from '@/features/brand-dna/useBrandAssetUrl'
import {
  DESIGN_STYLE_OPTIONS,
  EMPTY_VISUAL_IDENTITY,
  EMPTY_VOICE,
  IMAGE_STYLE_OPTIONS,
  PERSONALITY_TRAITS,
} from '@/features/brand-dna/types'
import type { DesignStyle, ImageStyle, VisualIdentitySection } from '@/features/brand-dna/types'
import type { TablesUpdate } from '@/types/database'
import { BrandColors } from '@/features/brand-style/BrandColors'
import { StyleCardPicker } from '@/features/brand-style/StyleCardPicker'
import { ImageStylePreview, DesignStylePreview } from '@/features/brand-style/StylePreviews'
import { BrandLibrary } from '@/features/brand-style/BrandLibrary'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export function BrandStylePage() {
  const { activeWorkspace, hasRole, isLoading: workspaceLoading } = useWorkspace()
  const queryClient = useQueryClient()
  const canWrite = hasRole(['owner', 'admin', 'editor'])
  const workspaceId = activeWorkspace?.id ?? ''

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['brand-profile', workspaceId],
    queryFn: () => ensureBrandProfile(workspaceId),
    enabled: !!workspaceId,
  })

  const [visualIdentity, setVisualIdentity] = React.useState<VisualIdentitySection | null>(null)
  const [logoPath, setLogoPath] = React.useState('')
  const [personalityTraits, setPersonalityTraits] = React.useState<string[]>([])
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    if (!profile) return
    setVisualIdentity({
      ...EMPTY_VISUAL_IDENTITY,
      ...(typeof profile.visual_identity === 'object' && profile.visual_identity ? profile.visual_identity : {}),
    })
    setLogoPath(profile.logo_path ?? '')
    const voice = { ...EMPTY_VOICE, ...(typeof profile.voice === 'object' && profile.voice ? profile.voice : {}) }
    setPersonalityTraits(voice.personality_traits)
    setDirty(false)
  }, [profile])

  const { data: logoUrl } = useBrandAssetUrl(logoPath)

  // Evita perda silenciosa ao fechar a aba ou dar refresh com alterações
  // não salvas (cores, estilo de imagem/design, traços de voz, logo).
  React.useEffect(() => {
    if (!dirty) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!visualIdentity) throw new Error('Sem dados para salvar.')
      const voice = { ...EMPTY_VOICE, ...(typeof profile?.voice === 'object' && profile?.voice ? profile.voice : {}) }
      return updateBrandProfile(workspaceId, {
        visual_identity: visualIdentity as unknown as TablesUpdate<'brand_profiles'>['visual_identity'],
        logo_path: logoPath || null,
        voice: { ...voice, personality_traits: personalityTraits } as unknown as TablesUpdate<'brand_profiles'>['voice'],
      })
    },
    onSuccess: (row) => {
      queryClient.setQueryData(['brand-profile', workspaceId], row)
      queryClient.invalidateQueries({ queryKey: ['onboarding-state', workspaceId] })
      setDirty(false)
    },
  })

  const [uploadingLogo, setUploadingLogo] = React.useState(false)
  const logoInputRef = React.useRef<HTMLInputElement>(null)

  async function handleLogoFile(file: File) {
    if (!workspaceId) return
    setUploadingLogo(true)
    try {
      const path = await uploadBrandAsset(workspaceId, 'logo', file)
      setLogoPath(path)
      setDirty(true)
    } finally {
      setUploadingLogo(false)
    }
  }

  function patchVisualIdentity(patch: Partial<VisualIdentitySection>) {
    setVisualIdentity((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  function toggleTrait(trait: string) {
    setPersonalityTraits((prev) => (prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]))
    setDirty(true)
  }

  if (workspaceLoading || profileLoading || !visualIdentity || !activeWorkspace) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Estilo da Marca</h1>
          <p className="text-sm text-ink-500">
            Cores, logo, tom de voz e as referências visuais que vão guiar as artes criadas pra você.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dna-da-marca">← DNA da Marca</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cores da marca</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandColors
            value={visualIdentity}
            onChange={(patch) => patchVisualIdentity(patch)}
          />
          {!canWrite && <p className="mt-2 text-xs text-ink-400">Só owner/admin/editor podem editar.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-lg">
            <AvatarImage src={logoUrl ?? undefined} alt="Logo" className="object-contain" />
            <AvatarFallback className="rounded-lg">{activeWorkspace.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          {canWrite && (
            <div className="flex flex-col gap-1">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleLogoFile(file)
                  e.target.value = ''
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? 'Enviando…' : logoPath ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              <p className="text-xs text-ink-400">PNG, JPEG, WebP ou SVG.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estilo de comunicação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-ink-500">
            Mesma personalidade de voz configurada no DNA — editável aqui, sem duplicar campo.
          </p>
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_TRAITS.map((trait) => {
              const active = personalityTraits.includes(trait)
              return (
                <button
                  key={trait}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => toggleTrait(trait)}
                  className={
                    active
                      ? 'rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-brand-300 dark:border-ink-700 dark:text-ink-300'
                  }
                >
                  {trait}
                </button>
              )
            })}
          </div>
          <Link to="/dna-da-marca" className="text-xs font-medium text-brand-600 hover:underline">
            Ajustar tom, formalidade e vocabulário no DNA →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estilo de imagem</CardTitle>
        </CardHeader>
        <CardContent>
          <StyleCardPicker
            options={IMAGE_STYLE_OPTIONS}
            value={visualIdentity.image_style}
            onChange={(v: ImageStyle) => patchVisualIdentity({ image_style: v })}
            renderPreview={(v) => <ImageStylePreview style={v} primary={visualIdentity.primary_color || '#6748fa'} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estilo de design</CardTitle>
        </CardHeader>
        <CardContent>
          <StyleCardPicker
            options={DESIGN_STYLE_OPTIONS}
            value={visualIdentity.design_style}
            onChange={(v: DesignStyle) => patchVisualIdentity({ design_style: v })}
            renderPreview={(v) => <DesignStylePreview style={v} primary={visualIdentity.primary_color || '#6748fa'} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Biblioteca da Marca
            <Badge variant="neutral">novo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BrandLibrary workspaceId={workspaceId} canWrite={canWrite} />
        </CardContent>
      </Card>

      {canWrite && (
        <div className="sticky bottom-4 flex flex-col items-end gap-1.5">
          {saveMutation.isError && (
            <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              Erro ao salvar. Tente novamente.
            </p>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} size="lg">
            {saveMutation.isPending ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Salvo'}
          </Button>
        </div>
      )}
    </div>
  )
}
