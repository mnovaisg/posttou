import * as React from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase/client'
import { savePendingCoupon } from '@/lib/pendingCoupon'
import type { PendingCoupon } from '@/lib/pendingCoupon'

/**
 * Ajuste cupom na Landing — mesmo princípio do useDiscoveryClaimOnLogin:
 * se o cupom aplicado na Landing sobreviveu à confirmação de e-mail via
 * raw_user_meta_data (pending_coupon), copia pro sessionStorage desta
 * aba/sessão assim que há usuário autenticado — é daí que o BillingPage
 * lê e revalida de verdade (nunca confia neste valor como autoridade
 * sobre desconto). Consumido da conta uma única vez.
 */
export function usePendingCouponClaim() {
  const { user } = useAuth()
  const attemptedRef = React.useRef(false)

  React.useEffect(() => {
    if (attemptedRef.current || !user) return
    const metadataCoupon = user.user_metadata?.pending_coupon as PendingCoupon | undefined
    if (!metadataCoupon?.code || !metadataCoupon?.planId || !metadataCoupon?.billingInterval) return
    attemptedRef.current = true
    savePendingCoupon(metadataCoupon)
    void supabase.auth.updateUser({ data: { pending_coupon: null } }).catch(() => {})
  }, [user])
}
