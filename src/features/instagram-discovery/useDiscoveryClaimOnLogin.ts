import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { supabase } from '@/lib/supabase/client'
import { ensureBrandProfile, fetchBrandProfile, updateBrandProfile } from '@/features/brand-dna/api'
import { claimDiscovery } from '@/features/instagram-discovery/api'
import { clearDiscoveryToken, readDiscoveryToken } from '@/features/instagram-discovery/session-token'
import {
  mapDiscoveryDnaToBrandProfilePatch,
  mapDnaReviewStateToBrandProfilePatch,
} from '@/features/instagram-discovery/mapDnaToBrandProfilePatch'
import type { DnaReviewState } from '@/features/instagram-discovery/DnaReviewCards'

/**
 * Dispara o claim de uma sessão de Discovery pendente assim que o
 * usuário autenticado tem um workspace ativo (logo após cadastro
 * confirmado ou login). O DNA reivindicado pré-preenche brand_profiles.
 *
 * Bloco 7.1: quando existe dna_revisado (o usuário já reviu e aprovou o
 * DNA em DnaReviewCards, antes do cadastro), o brand_profiles marcado
 * como onboarding_completed_at/step 6 — a aprovação pré-cadastro já É a
 * aprovação, então BrandDnaPage não pede a mesma confirmação de novo
 * ("Conhecemos sua marca ✨"). Quando só existe dna_preliminar (sem
 * revisão — sessão antiga ou caminho degradado), o comportamento
 * anterior se mantém: cai no fluxo "Conhecer sua marca" do wizard.
 *
 * first_content_completed_at também é marcado junto: sem isso,
 * BrandDnaPage (onboarding_completed_at preenchido + essa coluna nula)
 * entra automaticamente no FirstContentFlow — que dispara geração REAL
 * de texto+imagem por IA (mesmo pipeline do Criar com IA manual). Um
 * usuário vindo da Discovery já tem seu "primeiro conteúdo" — as 3
 * sugestões promovidas pelo claim — então essa etapa automática é
 * redundante e, pior, geraria uma imagem via Kie.ai sem o usuário pedir
 * (bug real encontrado testando este bloco). Mesmo padrão do backfill em
 * add_first_content_completed_at_to_brand_profiles.sql.
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

        // Melhor esforço: os 3 conteúdos já foram promovidos no backend
        // pelo próprio claim, então uma falha aqui não deve bloquear a
        // navegação — só significa que o brand_profile não foi
        // pré-preenchido automaticamente desta vez (usuário ainda pode
        // revisar/preencher no wizard depois).
        try {
          await ensureBrandProfile(activeWorkspace.id)
          // DNA revisado = o usuário já aprovou isso explicitamente em
          // DnaReviewCards antes do cadastro (Bloco 2) — marca
          // onboarding_completed_at na mesma escrita que persiste o DNA,
          // a fonte de verdade lida por get_onboarding_state/
          // check_brand_dna_ready. Sem isso, o guia "Comece por aqui"
          // pedia pra "configurar o DNA" de novo mesmo com tudo pronto.
          const patch = result.dnaRevisado
            ? {
                ...mapDnaReviewStateToBrandProfilePatch(result.handle, result.dnaRevisado as DnaReviewState),
                onboarding_completed_at: new Date().toISOString(),
                onboarding_step: 6,
                first_content_completed_at: new Date().toISOString(),
              }
            : mapDiscoveryDnaToBrandProfilePatch(result.handle, undefined, result.dna)
          await updateBrandProfile(activeWorkspace.id, patch)
        } catch (patchErr) {
          console.error('useDiscoveryClaimOnLogin: falha ao pré-preencher brand_profile (não bloqueante).', patchErr)
        }

        // O usuário já viu DNA, previews e passou pelo cadastro antes de
        // chegar aqui — o destino é o conteúdo já populado com as 3
        // sugestões, nunca de volta a uma tela que ele já concluiu.
        navigate('/conteudo', { replace: true })
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
