// KieProvider — adapter concreto para a Kie.ai (https://docs.kie.ai).
// Implementa TextGenerationProvider (chat completions síncrono,
// OpenAI-compatible) e AsyncMediaProvider (jobs de imagem/vídeo/áudio,
// preparado para a Fase 5 — não usado pela UI da Fase 4).
import type {
  AsyncMediaProvider,
  MediaTaskHandle,
  MediaTaskRequest,
  MediaTaskStatus,
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResult,
} from './types.ts'
import { ProviderRequestError } from './types.ts'

const KIE_BASE_URL = 'https://api.kie.ai'
const DEFAULT_TEXT_MODEL = 'gpt-5-2'

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ProviderRequestError('Tempo limite excedido ao chamar o provedor de IA.', 504)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export class KieProvider implements TextGenerationProvider, AsyncMediaProvider {
  readonly name = 'kie'
  private apiKey: string
  private webhookHmacKey?: string
  private textModel: string

  constructor(apiKey: string, webhookHmacKey?: string, textModel = DEFAULT_TEXT_MODEL) {
    this.apiKey = apiKey
    this.webhookHmacKey = webhookHmacKey
    this.textModel = textModel
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async generateText(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const res = await timedFetch(
      `${KIE_BASE_URL}/${this.textModel}/v1/chat/completions`,
      {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
          max_tokens: req.maxTokens ?? 2048,
        }),
      },
      30_000,
    )

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ProviderRequestError(`Kie.ai retornou erro ${res.status}: ${detail.slice(0, 500)}`, res.status)
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      throw new ProviderRequestError('Kie.ai retornou uma resposta em formato inesperado.', 502)
    }

    return {
      text,
      provider: this.name,
      model: this.textModel,
      usage: {
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
      },
    }
  }

  // Modelo concreto usado na Fase 5: 4o Image (endpoint dedicado e
  // documentado, diferente do endpoint genérico /api/v1/jobs/*). Só suporta
  // size '1:1' | '3:2' | '2:3' — não existe '4:5'/'9:16' nativo; mapeamento
  // feito pelo chamador (ver map em ai-generate-image).
  async createTask(req: MediaTaskRequest): Promise<MediaTaskHandle> {
    const res = await timedFetch(
      `${KIE_BASE_URL}/api/v1/gpt4o-image/generate`,
      {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          prompt: req.input.prompt,
          size: req.input.size,
          callBackUrl: req.callbackUrl,
        }),
      },
      15_000,
    )

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ProviderRequestError(`Kie.ai retornou erro ${res.status}: ${detail.slice(0, 500)}`, res.status)
    }

    const data = await res.json()
    const taskId = data?.data?.taskId
    if (!taskId) throw new ProviderRequestError(`Kie.ai não retornou taskId: ${JSON.stringify(data).slice(0, 300)}`, 502)

    return { provider: this.name, model: 'gpt4o-image', taskId }
  }

  async getTaskStatus(taskId: string): Promise<MediaTaskStatus> {
    const res = await timedFetch(
      `${KIE_BASE_URL}/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`,
      { method: 'GET', headers: this.authHeaders() },
      15_000,
    )

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ProviderRequestError(`Kie.ai retornou erro ${res.status}: ${detail.slice(0, 500)}`, res.status)
    }

    const data = await res.json()
    const record = data?.data
    if (!record) throw new ProviderRequestError('Kie.ai não retornou registro da task.', 502)

    const stateMap: Record<string, 'generating' | 'success' | 'fail'> = {
      GENERATING: 'generating',
      SUCCESS: 'success',
      CREATE_TASK_FAILED: 'fail',
      GENERATE_FAILED: 'fail',
    }

    return {
      taskId,
      state: stateMap[record.status] ?? 'generating',
      resultUrls: record.response?.resultUrls,
      failMsg: record.errorMessage,
    }
  }

  async verifyWebhookSignature(taskId: string, timestampSeconds: string, signature: string): Promise<boolean> {
    if (!this.webhookHmacKey) return false
    return verifyKieWebhookSignature(taskId, timestampSeconds, signature, this.webhookHmacKey)
  }
}

async function verifyKieWebhookSignature(
  taskId: string,
  timestampSeconds: string,
  signatureBase64: string,
  webhookHmacKey: string,
): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookHmacKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${taskId}.${timestampSeconds}`))
  const expected = base64FromBytes(new Uint8Array(signatureBytes))
  return timingSafeEqual(expected, signatureBase64)
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
