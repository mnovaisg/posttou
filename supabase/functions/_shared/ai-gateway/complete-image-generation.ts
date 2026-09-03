// Lógica compartilhada entre o webhook (ai-webhook) e o polling de
// fallback (ai-check-image) para concluir uma geração de imagem: consulta
// o status real no provider, transfere o resultado para o Storage próprio
// do POSTTOU e atualiza ai_generations. Nunca deixa o conteúdo depender de
// URL temporária de terceiro.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AsyncMediaProvider } from './types.ts'
import { normalizeImageForFormat } from './normalize-image-format.ts'

export type CompleteResult = { status: 'processing' | 'success' | 'failed' }

// deno-lint-ignore no-explicit-any
export async function completeImageGeneration(admin: SupabaseClient<any>, mediaProvider: AsyncMediaProvider, generation: Record<string, any>): Promise<CompleteResult> {
  if (generation.status !== 'processing') {
    return { status: generation.status }
  }
  if (!generation.task_id) {
    return { status: 'processing' }
  }

  const status = await mediaProvider.getTaskStatus(generation.task_id)

  if (status.state === 'generating' || status.state === 'waiting' || status.state === 'queuing') {
    return { status: 'processing' }
  }

  if (status.state === 'success') {
    if (!status.resultUrls?.length) {
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'invalid_response', error_message: 'Provider reportou sucesso sem URLs de resultado.', completed_at: new Date().toISOString() })
        .eq('id', generation.id)
        .eq('status', 'processing')
      await admin.rpc('refund_ai_generation_system', { p_generation_id: generation.id }).catch((e: unknown) => console.error('refund falhou', e))
      return { status: 'failed' }
    }

    const assetPaths: string[] = []
    // Bloco 12.3 — metadados não sensíveis da normalização de proporção,
    // um item por asset, gravados em ai_generations.result_payload.
    const normalizationMeta: Array<{
      original_path: string
      final_path: string
      original_width: number
      original_height: number
      final_width: number
      final_height: number
      format: string | null
      method: string
    }> = []
    const folder = generation.content_id ? `${generation.workspace_id}/${generation.content_id}` : `${generation.workspace_id}/geracoes-ia`

    for (const url of status.resultUrls) {
      const imgRes = await fetch(url)
      if (!imgRes.ok) continue
      const bytes = new Uint8Array(await imgRes.arrayBuffer())
      const contentType = imgRes.headers.get('content-type') ?? 'image/png'
      const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'

      // Original SEMPRE preservado intacto, nunca sobrescrito — mesmo
      // quando a normalização abaixo entra em ação, esta cópia continua
      // existindo no Storage para auditoria/reprocessamento futuro.
      const originalPath = `${folder}/${crypto.randomUUID()}.${ext}`
      const { error: originalUploadError } = await admin.storage.from('content-assets').upload(originalPath, bytes, { contentType, upsert: false })
      if (originalUploadError) continue

      let finalPath = originalPath
      let normResult: Awaited<ReturnType<typeof normalizeImageForFormat>> | null = null
      try {
        normResult = await normalizeImageForFormat(bytes, generation.format ?? null)
      } catch (err) {
        // Nunca deixa uma falha de normalização derrubar a geração —
        // volta pro comportamento anterior (usa o arquivo original como
        // veio do provider) e só registra o erro pra investigação.
        console.error('completeImageGeneration: falha ao normalizar proporção da imagem, usando original.', err)
      }

      if (normResult && normResult.method !== 'unchanged') {
        const normalizedPath = `${folder}/${crypto.randomUUID()}.png`
        const { error: normalizedUploadError } = await admin.storage
          .from('content-assets')
          .upload(normalizedPath, normResult.bytes, { contentType: normResult.contentType, upsert: false })
        if (!normalizedUploadError) {
          finalPath = normalizedPath
        } else {
          console.error('completeImageGeneration: falha ao subir asset normalizado, usando original.', normalizedUploadError)
        }
      }

      assetPaths.push(finalPath)
      normalizationMeta.push({
        original_path: originalPath,
        final_path: finalPath,
        original_width: normResult?.originalWidth ?? 0,
        original_height: normResult?.originalHeight ?? 0,
        final_width: normResult?.finalWidth ?? 0,
        final_height: normResult?.finalHeight ?? 0,
        format: generation.format ?? null,
        method: normResult?.method ?? 'unchanged',
      })
    }

    if (!assetPaths.length) {
      await admin
        .from('ai_generations')
        .update({ status: 'failed', error_code: 'storage_transfer_failed', error_message: 'Falha ao transferir a imagem para o Storage do POSTTOU.', completed_at: new Date().toISOString() })
        .eq('id', generation.id)
        .eq('status', 'processing')
      await admin.rpc('refund_ai_generation_system', { p_generation_id: generation.id }).catch((e: unknown) => console.error('refund falhou', e))
      return { status: 'failed' }
    }

    // Idempotência real: .update().eq('status','processing') sem checar o
    // resultado deixava a função "achar" que persistiu mesmo quando a
    // condição não bateu mais (corrida com outra chamada concorrente de
    // completeImageGeneration para a mesma linha — webhook x recovery x
    // polling do frontend podem, em teoria, chegar quase juntos). Nesse
    // caso o código seguia como se tivesse dado certo, subia a imagem pro
    // Storage sem necessidade e registrava sucesso — encontrado
    // retroativamente via 2 arquivos idênticos no Storage para a mesma
    // geração do DNA Visual (Fase 12), 74 minutos e uma reconciliação
    // "fantasma" depois. Agora só seguimos se a linha realmente mudou aqui.
    const { data: updatedRows, error: updateError } = await admin
      .from('ai_generations')
      .update({
        status: 'success',
        result_asset_paths: assetPaths,
        result_payload: { image_normalization: normalizationMeta },
        completed_at: new Date().toISOString(),
      })
      .eq('id', generation.id)
      .eq('status', 'processing')
      .select('id')

    if (updateError) {
      console.error('completeImageGeneration: falha ao persistir sucesso', updateError)
      return { status: 'processing' }
    }
    if (!updatedRows?.length) {
      // Outra chamada concorrente já concluiu (ou alterou) esta geração
      // entre a leitura e este update — não é nosso trabalho mais; a
      // imagem que acabamos de baixar/subir fica órfã no Storage (aceito
      // como custo do caso raro, não apagamos por segurança), mas não
      // sobrescrevemos nem duplicamos o audit log.
      console.warn('completeImageGeneration: update não afetou nenhuma linha (provável conclusão concorrente)', { generation_id: generation.id })
      return { status: 'processing' }
    }

    await admin.from('audit_logs').insert({
      workspace_id: generation.workspace_id,
      user_id: generation.user_id,
      action: 'ia_geracao_imagem_concluida',
      resource_type: 'ai_generations',
      resource_id: generation.id,
      metadata: { asset_count: assetPaths.length },
    })

    return { status: 'success' }
  }

  // status.state === 'fail'
  await admin
    .from('ai_generations')
    .update({ status: 'failed', error_code: 'provider_error', error_message: status.failMsg ?? 'Geração falhou no provedor.', completed_at: new Date().toISOString() })
    .eq('id', generation.id)
    .eq('status', 'processing')
  await admin.rpc('refund_ai_generation_system', { p_generation_id: generation.id }).catch((e: unknown) => console.error('refund falhou', e))
  return { status: 'failed' }
}
