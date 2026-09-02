// Ponto único de eventos de conversão da landing pública — preparado
// para medição futura, sem nenhum serviço externo configurado ainda
// (não adicionamos analytics de terceiros sem autorização explícita).
// Quando um provider for decidido, só este arquivo muda.
export type AnalyticsEvent =
  | 'landing_cta_start_free_click'
  | 'landing_cta_login_click'
  | 'landing_pricing_viewed'
  | 'landing_plan_selected'
  | 'landing_signup_started'
  // Bloco 11 — nomes de evento pedidos explicitamente para o funil da nova landing.
  | 'landing_view'
  | 'instagram_handle_started'
  | 'instagram_analysis_started'
  | 'pricing_viewed'
  | 'signup_cta_clicked'

export function trackEvent(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info('[analytics]', event, props ?? {})
  }
}
