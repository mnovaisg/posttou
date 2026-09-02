export interface DiscoveryValueField {
  value: string
  confidence: number
  source: 'ai_inference'
}

export interface DiscoveryIdea {
  titulo: string
  gancho: string
  formato: 'post' | 'carrossel' | 'reel'
  pilar: string
  objetivo: string
  resumo: string
}

export interface DiscoveryDna {
  identidade: {
    descricao: DiscoveryValueField
    posicionamento_provavel: DiscoveryValueField
    nicho: DiscoveryValueField
    subnicho: DiscoveryValueField
  }
  publico: {
    publico_provavel: DiscoveryValueField
    dores: string[]
    interesses: string[]
    desejos: string[]
  }
  estrategia: {
    pilares_conteudo: { nome: string; percentual_estimado: number; confidence: number }[]
    temas_recorrentes: string[]
    objetivos_provaveis: string[]
    formatos_recomendados: string[]
  }
  voz: {
    tom: DiscoveryValueField
    personalidade: string[]
    vocabulario_recomendado: string[]
    palavras_evitar: string[]
  }
  oportunidades: {
    temas_com_potencial: string[]
    lacunas_percebidas: string[]
    sugestoes: string[]
  }
  identidade_visual: {
    disponivel: boolean
    observacoes: string | null
  }
  // A IA responde "ideias" no mesmo objeto do DNA — mantido aqui para
  // refletir o formato real gravado em dna_preliminar.
  ideias?: DiscoveryIdea[]
}

export interface DiscoveryProfileSummary {
  username: string
  name?: string
  profilePictureUrl?: string
  followersCount?: number
  mediaCount?: number
}

export type DiscoveryFieldAvailability = Record<string, 'available' | 'unavailable'>

/** Onde o visitante parou na experiência pré-cadastro — só para
 * restaurar a tela certa depois de um refresh, nunca usado como
 * controle de acesso (isso continua sendo status/claimed_at/expires_at
 * no backend). */
export type DiscoveryFlowStage = 'dna' | 'previews' | 'signup'

export interface DiscoveryStartResult {
  token: string
  status: 'ready' | 'failed'
  handle: string
  profile?: DiscoveryProfileSummary
  fieldsAvailability?: DiscoveryFieldAvailability
  dna?: DiscoveryDna
  dnaRevisado?: unknown
  flowStage?: DiscoveryFlowStage | null
  error?: string
  message?: string
}

export interface DiscoveryGetResult {
  status: 'collecting' | 'analyzing' | 'ready' | 'failed' | 'claimed' | 'expired'
  handle: string
  dna: DiscoveryDna | null
  dnaRevisado?: unknown
  flowStage?: DiscoveryFlowStage | null
  ideias: DiscoveryIdea[] | null
  errorCode?: string | null
  errorMessage?: string | null
  claimed: boolean
  message?: string
}

export interface ClaimDiscoveryResult {
  success: true
  handle: string
  dna: DiscoveryDna
  ideias: DiscoveryIdea[]
}

export const DISCOVERY_ERROR_MESSAGES: Record<string, string> = {
  invalid_handle: 'Esse @ não parece válido. Use letras, números, ponto ou underscore.',
  rate_limited: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
  profile_not_found: 'Não encontramos esse perfil, ou ele não é uma conta profissional (Business/Creator) do Instagram.',
  provider_error: 'Não conseguimos consultar o Instagram agora. Tente novamente em instantes.',
  timeout: 'A consulta ao Instagram demorou demais. Tente novamente.',
  not_configured: 'A análise automática pelo Instagram ainda não está disponível.',
  ai_not_configured: 'A análise automática por IA ainda não está disponível.',
  ai_error: 'Conseguimos encontrar seu perfil, mas tivemos um problema ao montar seu DNA. Tente novamente.',
  not_found: 'Essa análise não foi encontrada ou expirou.',
  expired: 'Essa análise expirou. Faça uma nova busca pelo @.',
  invalid_session: 'Essa análise não existe mais, já foi usada, ou expirou.',
  internal_error: 'Algo deu errado. Tente novamente.',
}

export function extractDiscoveryIdeas(
  result: DiscoveryStartResult | DiscoveryGetResult | null | undefined,
): DiscoveryIdea[] {
  if (!result) return []
  if ('ideias' in result && Array.isArray(result.ideias)) return result.ideias
  const dna = (result as DiscoveryStartResult).dna
  return dna?.ideias ?? []
}
