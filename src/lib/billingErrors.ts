// Fase 14C — tratamento centralizado de erros de assinatura (402).
// Nenhuma tela deve mostrar "subscription_required" ou um reason cru como
// mensagem principal — sempre traduz para uma frase acionável, com CTA.
export interface BillingErrorInfo {
  message: string
  cta: { label: string; to: string } | null
}

const REASON_MESSAGES: Record<string, BillingErrorInfo> = {
  SUBSCRIPTION_EXPIRED: {
    message: 'Seu período gratuito terminou. Assine um plano para continuar criando.',
    cta: { label: 'Ver planos', to: '/plano-e-cobranca' },
  },
  SUBSCRIPTION_CANCELLED: {
    message: 'Sua assinatura foi cancelada. Reative um plano para continuar criando.',
    cta: { label: 'Ver planos', to: '/plano-e-cobranca' },
  },
  SUBSCRIPTION_NOT_ACTIVE: {
    message: 'Sua assinatura não está ativa no momento. Verifique seu plano para continuar.',
    cta: { label: 'Gerenciar assinatura', to: '/plano-e-cobranca' },
  },
  FRANCHISE_LIMIT_REACHED: {
    message: 'Você utilizou todos os conteúdos incluídos no seu plano neste mês.',
    cta: { label: 'Fazer upgrade', to: '/plano-e-cobranca' },
  },
  NO_SUBSCRIPTION_FOUND: {
    message: 'Não encontramos uma assinatura ativa para este workspace.',
    cta: { label: 'Ver planos', to: '/plano-e-cobranca' },
  },
}

/** payment pendente não tem um "reason" fixo — detectado pelo status da assinatura quando disponível. */
const PAST_DUE_MESSAGE: BillingErrorInfo = {
  message: 'Não conseguimos confirmar seu pagamento. Atualize sua cobrança para continuar.',
  cta: { label: 'Atualizar pagamento', to: '/plano-e-cobranca' },
}

export function isBillingError(status: number, body: { error?: string }): boolean {
  return status === 402 && (body.error === 'subscription_required' || body.error === 'franchise_limit_reached')
}

export class BillingError extends Error {
  cta: { label: string; to: string } | null
  constructor(info: BillingErrorInfo) {
    super(info.message)
    this.name = 'BillingError'
    this.cta = info.cta
  }
}

export function mapBillingError(body: { error?: string; reason?: string; status?: string; message?: string }): BillingErrorInfo {
  if (body.status === 'past_due') return PAST_DUE_MESSAGE
  if (body.reason && REASON_MESSAGES[body.reason]) return REASON_MESSAGES[body.reason]
  if (body.error === 'franchise_limit_reached') return REASON_MESSAGES.FRANCHISE_LIMIT_REACHED
  return {
    message: 'Não foi possível continuar por uma restrição do seu plano. Verifique sua assinatura.',
    cta: { label: 'Ver planos', to: '/plano-e-cobranca' },
  }
}

/**
 * Converte um erro cru do PostgREST/Postgres para o mesmo modelo de erro de
 * billing acima — usado por caminhos que inserem direto numa tabela
 * protegida pelo gatilho content_franchise_gate (ex.: criação manual de
 * conteúdo) em vez de passar por uma Edge Function com corpo JSON
 * {error, reason}. O gatilho levanta RAISE EXCEPTION com o código como
 * mensagem literal (ex.: 'SUBSCRIPTION_EXPIRED'), que o supabase-js expõe
 * em error.message — reaproveita o mesmo REASON_MESSAGES, sem duplicar
 * texto. Retorna null quando a mensagem não é um código de billing
 * reconhecido, para o chamador usar seu próprio fallback genérico.
 */
export function mapPostgrestFranchiseGateError(error: { message?: string } | null | undefined): BillingErrorInfo | null {
  const code = error?.message
  if (code && code in REASON_MESSAGES) return REASON_MESSAGES[code]
  return null
}
