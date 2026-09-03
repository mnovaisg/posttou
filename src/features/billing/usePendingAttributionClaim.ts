import * as React from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { supabase } from '@/lib/supabase/client'

/**
 * Ajuste Clientes & Leads — mesmo princípio do useDiscoveryClaimOnLogin/
 * usePendingCouponClaim: se UTMs (e/ou o cupom de entrada) sobreviveram à
 * confirmação de e-mail via raw_user_meta_data.pending_attribution, grava
 * de vez em lead_attribution assim que há workspace ativo. A RPC
 * (claim_lead_attribution_system) usa ON CONFLICT DO NOTHING — nunca
 * sobrescreve uma atribuição já existente para a organização.
 */
export function usePendingAttributionClaim() {
  const { user } = useAuth()
  const { activeWorkspace, isLoading } = useWorkspace()
  const attemptedRef = React.useRef(false)

  React.useEffect(() => {
    if (attemptedRef.current || isLoading || !activeWorkspace || !user) return
    const pending = user.user_metadata?.pending_attribution as Record<string, string> | undefined
    if (!pending || Object.keys(pending).length === 0) return
    attemptedRef.current = true

    void (async () => {
      try {
        await supabase.rpc('claim_lead_attribution_system', {
          p_organization_id: activeWorkspace.organization_id,
          p_utm_source: pending.utm_source ?? null,
          p_utm_medium: pending.utm_medium ?? null,
          p_utm_campaign: pending.utm_campaign ?? null,
          p_utm_content: pending.utm_content ?? null,
          p_utm_term: pending.utm_term ?? null,
          p_coupon_code: pending.coupon_code ?? null,
        } as never)
      } catch (err) {
        console.error('usePendingAttributionClaim: falha ao gravar atribuição.', err)
      } finally {
        await supabase.auth.updateUser({ data: { pending_attribution: null } }).catch(() => {})
      }
    })()
  }, [isLoading, activeWorkspace, user])
}
