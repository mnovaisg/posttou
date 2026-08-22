// AI Gateway — contratos de Provider/Adapter.
//
// Nenhuma feature ou Edge Function de negócio deve chamar um provider de IA
// diretamente. Toda comunicação passa por estas interfaces + getTextProvider()
// (gateway.ts), para que trocar/adicionar um provider nunca exija tocar em
// código de feature.

export interface TextGenerationRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
}

export interface TextGenerationResult {
  text: string
  provider: string
  model: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

/** Capacidade síncrona: request → resposta pronta (usado por texto/legenda/roteiro). */
export interface TextGenerationProvider {
  readonly name: string
  generateText(req: TextGenerationRequest): Promise<TextGenerationResult>
}

export interface MediaTaskRequest {
  model: string
  input: Record<string, unknown>
  callbackUrl?: string
}

export interface MediaTaskHandle {
  provider: string
  model: string
  taskId: string
}

export type MediaTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

export interface MediaTaskStatus {
  taskId: string
  state: MediaTaskState
  resultUrls?: string[]
  failMsg?: string
  creditsConsumed?: number
}

/**
 * Capacidade assíncrona baseada em job (imagem/vídeo/áudio). Preparada para
 * o Editor Visual (Fase 5) — não usada pela UI da Fase 4, que é só texto.
 */
export interface AsyncMediaProvider {
  readonly name: string
  createTask(req: MediaTaskRequest): Promise<MediaTaskHandle>
  getTaskStatus(taskId: string): Promise<MediaTaskStatus>
  verifyWebhookSignature(taskId: string, timestampSeconds: string, signature: string): Promise<boolean>
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`Provider "${providerName}" não está configurado neste ambiente.`)
    this.name = 'ProviderNotConfiguredError'
  }
}

export class ProviderRequestError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ProviderRequestError'
    this.status = status
  }
}
