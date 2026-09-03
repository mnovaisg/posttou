// Transporte do código de cupom aplicado na Landing (pré-cadastro) até o
// Billing, onde ele é revalidado de verdade. Mesmo princípio do
// pendingInstagramHandle/discovery-token: sessionStorage nunca é
// autoridade sobre desconto, só carrega o código — o servidor sempre
// decide se ele vale e qual o benefício, tanto no preview quanto (de
// novo, com força total) na reserva do checkout.
const STORAGE_KEY = 'posttou:pending-coupon'

export interface PendingCoupon {
  code: string
  planId: string
  billingInterval: 'monthly' | 'yearly'
}

export function savePendingCoupon(coupon: PendingCoupon): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coupon))
}

function isPendingCoupon(value: unknown): value is PendingCoupon {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.code === 'string' && !!v.code.trim() && typeof v.planId === 'string' && !!v.planId.trim() && (v.billingInterval === 'monthly' || v.billingInterval === 'yearly')
}

/** Leitura de uso único: consome e remove a chave. */
export function readPendingCoupon(): PendingCoupon | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  window.sessionStorage.removeItem(STORAGE_KEY)
  try {
    const parsed = JSON.parse(raw)
    return isPendingCoupon(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearPendingCoupon(): void {
  window.sessionStorage.removeItem(STORAGE_KEY)
}
