import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { ensureBrandProfile, updateBrandProfile } from '@/features/brand-dna/api'
import { claimDiscovery } from '@/features/instagram-discovery/api'
import {
  clearDiscoveryToken,
  clearSelectedIdeaIndex,
  readDiscoveryToken,
  readSelectedIdeaIndex,
  savePendingCreateIdea,
} from '@/features/instagram-discovery/session-token'
import { mapDiscoveryDnaToBrandProfilePatch } from '@/features/instagram-discovery/mapDnaToBrandProfilePatch'

/**
 * Dispara o claim de uma sessão de Discovery pendente assim que o
 * usuário autenticado tem um workspace ativo (logo após cadastro
 * confirmado ou login). O DNA reivindicado pré-preenche brand_profiles
 * — a revisão/aprovação continua acontecendo no wizard existente
 * (BrandDnaPage), nunca num editor paralelo.
 */
export function useDiscoveryClaimOnLogin() {
  const { activeWorkspace, isLoading } = useWorkspace()
  const navigate = useNavigate()
  const attemptedRef = React.useRef(false)

  React.useEffect(() => {
    if (isLoading || !activeWorkspace || attemptedRef.current) return
    const token = readDiscoveryToken()
    if (!token) return
    attemptedRef.current = true

    void (async () => {
      try {
        const result = await claimDiscovery(token, activeWorkspace.id)
        clearDiscoveryToken()
        await ensureBrandProfile(activeWorkspace.id)
        const patch = mapDiscoveryDnaToBrandProfilePatch(result.handle, undefined, result.dna)
        await updateBrandProfile(activeWorkspace.id, patch)

        const selectedIdeaIndex = readSelectedIdeaIndex()
        clearSelectedIdeaIndex()
        if (selectedIdeaIndex !== null && result.ideias?.[selectedIdeaIndex]) {
          savePendingCreateIdea(result.ideias[selectedIdeaIndex])
        }

        navigate('/configuracoes?discovery=1', { replace: true })
      } catch (err) {
        console.error('useDiscoveryClaimOnLogin: falha ao reivindicar sessão de discovery.', err)
        clearDiscoveryToken()
      }
    })()
  }, [isLoading, activeWorkspace, navigate])
}
