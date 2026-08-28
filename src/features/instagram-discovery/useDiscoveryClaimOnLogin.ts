import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { supabase } from '@/lib/supabase/client'
import { ensureBrandProfile, fetchBrandProfile, updateBrandProfile } from '@/features/brand-dna/api'
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
 * (BrandDnaPage → "Conhecemos sua marca ✨"), nunca num editor paralelo.
 *
 * Fonte do token, em ordem: raw_user_meta_data do próprio usuário
 * (sobrevive à troca de aba/dispositivo no fluxo de confirmação de
 * e-mail — sessionStorage não sobrevive) e, como fallback de
 * conveniência same-tab, sessionStorage (ex.: usuário já logado que
 * passou por /descobrir na mesma aba).
 */
export function useDiscoveryClaimOnLogin() {
  const { user } = useAuth()
  const { activeWorkspace, isLoading } = useWorkspace()
  const navigate = useNavigate()
  const attemptedRef = React.useRef(false)

  React.useEffect(() => {
    if (isLoading || !activeWorkspace || attemptedRef.current) return
    const metadataToken = (user?.user_metadata?.discovery_token as string | undefined) ?? null
    const token = metadataToken ?? readDiscoveryToken()
    if (!token) return
    attemptedRef.current = true

    void (async () => {
      try {
        // Workspace que já tem DNA (concluído ou com progresso real no
        // wizard) nunca é sobrescrito por uma sessão de Discovery antiga
        // ou por um claim tardio — o claim nem chega a ser consumido
        // neste caso; a sessão simplesmente expira sozinha depois.
        const existing = await fetchBrandProfile(activeWorkspace.id)
        const hasRealProgress = existing && ((existing.onboarding_step ?? 1) > 1 || existing.onboarding_completed_at)
        if (hasRealProgress) {
          clearDiscoveryToken()
          if (metadataToken) {
            await supabase.auth.updateUser({ data: { discovery_token: null } }).catch(() => {})
          }
          return
        }

        const result = await claimDiscovery(token, activeWorkspace.id)
        clearDiscoveryToken()
        if (metadataToken) {
          await supabase.auth.updateUser({ data: { discovery_token: null } }).catch(() => {})
        }

        await ensureBrandProfile(activeWorkspace.id)
        const patch = mapDiscoveryDnaToBrandProfilePatch(result.handle, undefined, result.dna)
        await updateBrandProfile(activeWorkspace.id, patch)

        const selectedIdeaIndex = readSelectedIdeaIndex()
        clearSelectedIdeaIndex()
        if (selectedIdeaIndex !== null && result.ideias?.[selectedIdeaIndex]) {
          savePendingCreateIdea(result.ideias[selectedIdeaIndex])
        }

        navigate('/dna-da-marca', { replace: true })
      } catch (err) {
        // Falha de rede/sessão expirada: não limpamos o token dos
        // metadados aqui de propósito — tenta de novo no próximo login,
        // e a própria sessão de Discovery expira em 24h de qualquer
        // forma (cron de limpeza já existente), então o pior caso é
        // autolimitado.
        console.error('useDiscoveryClaimOnLogin: falha ao reivindicar sessão de discovery.', err)
        clearDiscoveryToken()
      }
    })()
  }, [isLoading, activeWorkspace, user, navigate])
}
