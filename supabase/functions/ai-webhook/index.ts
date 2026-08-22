// Edge Function: receptor de webhook assíncrono da Kie.ai (geração de
// imagem — Fase 5). Autenticação própria: não usa JWT de usuário (é a
// Kie.ai chamando), e sim a assinatura HMAC do payload
// (X-Webhook-Timestamp + X-Webhook-Signature), verificada via
// KieProvider.verifyWebhookSignature.
//
// A conclusão de fato (consultar recordInfo, transferir para Storage,
// atualizar ai_generations) é compartilhada com o fallback de polling
// (ai-check-image) via completeImageGeneration — os dois caminhos chegam
// ao mesmo resultado.
//
// Idempotência em duas camadas: (1) UNIQUE(provider, task_id, signature)
// em ai_webhook_events deduplica entregas idênticas; (2) completeImageGeneration
// só age se ai_generations.status ainda for 'processing', o que também
// protege contra reentregas com timestamp (e portanto assinatura)
// diferente do mesmo evento, e contra corrida com o polling de fallback.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { completeImageGeneration } from '../_shared/ai-gateway/complete-image-generation.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const timestamp = req.headers.get('X-Webhook-Timestamp')
    const signature = req.headers.get('X-Webhook-Signature')
    if (!timestamp || !signature) return json({ error: 'Assinatura ausente.' }, 401)

    const rawBody = await req.text()
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return json({ error: 'Payload inválido.' }, 400)
    }

    const taskId = (payload?.data as Record<string, unknown> | undefined)?.taskId ?? payload?.taskId
    if (typeof taskId !== 'string' || !taskId) return json({ error: 'taskId ausente no payload.' }, 400)

    let mediaProvider
    try {
      mediaProvider = getMediaProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) return json({ error: 'not_configured' }, 501)
      throw err
    }

    const valid = await mediaProvider.verifyWebhookSignature(taskId, timestamp, signature)
    if (!valid) return json({ error: 'Assinatura inválida.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { error: insertError } = await admin.from('ai_webhook_events').insert({
      provider: mediaProvider.name,
      task_id: taskId,
      signature,
      payload,
    })
    const isDuplicateDelivery = !!insertError && insertError.code === '23505'
    if (insertError && !isDuplicateDelivery) {
      console.error('Falha ao registrar webhook event', insertError)
      return json({ error: 'Erro ao registrar evento.' }, 500)
    }

    const { data: generation } = await admin.from('ai_generations').select('*').eq('task_id', taskId).maybeSingle()

    if (!generation) {
      // Task de outro ambiente/teste ou já limpo — reconhece sem erro.
      return json({ received: true, duplicate: isDuplicateDelivery, matched: false })
    }

    const result = await completeImageGeneration(admin, mediaProvider, generation)
    return json({ received: true, matched: true, status: result.status })
  } catch (err) {
    console.error('Erro inesperado em ai-webhook', err)
    return json({ error: 'Erro inesperado.' }, 500)
  }
})
