// Atribuição de origem (UTMs) — mesmo princípio de transporte do
// pendingCoupon/pendingInstagramHandle: sessionStorage nunca é
// autoridade, só carrega os parâmetros até o primeiro login, onde a
// RPC claim_lead_attribution_system grava de forma definitiva (ON
// CONFLICT DO NOTHING — nunca sobrescreve uma atribuição já existente).
const STORAGE_KEY = 'posttou:pending-attribution'

export type PendingAttribution = Record<string, string | undefined>

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Só grava se a URL atual realmente carregar algum utm_* — navegação interna sem esses parâmetros nunca apaga o que já foi capturado nesta aba. */
export function captureAttributionFromLocation(search: string): void {
  const params = new URLSearchParams(search)
  const found: PendingAttribution = {}
  let any = false
  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value && value.trim()) {
      found[key] = value.trim().slice(0, 200)
      any = true
    }
  }
  if (any) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found))
  }
}

export function readPendingAttribution(): PendingAttribution | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingAttribution
  } catch {
    return null
  }
}

export function clearPendingAttribution(): void {
  window.sessionStorage.removeItem(STORAGE_KEY)
}
