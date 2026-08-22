// Lógica compartilhada entre o webhook (ai-webhook) e o polling de
// fallback (ai-check-image) para concluir uma geração de imagem: consulta
// o status real no provider, transfere o resultado para o Storage próprio
// do POSTTOU e atualiza ai_generations. Nunca deixa o conteúdo depender de
// URL temporária de terceiro.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AsyncMediaProvider } from './types.ts'

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
    const folder = generation.content_id ? `${generation.workspace_id}/${generation.content_id}` : `${generation.workspace_id}/geracoes-ia`

    for (const url of status.resultUrls) {
      const imgRes = await fetch(url)
      if (!imgRes.ok) continue
      const bytes = new Uint8Array(await imgRes.arrayBuffer())
      const contentType = imgRes.headers.get('content-type') ?? 'image/png'
      const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
      const path = `${folder}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await admin.storage.from('content-assets').upload(path, bytes, { contentType, upsert: false })
      if (!uploadError) assetPaths.push(path)
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

    await admin
      .from('ai_generations')
      .update({ status: 'success', result_asset_paths: assetPaths, completed_at: new Date().toISOString() })
      .eq('id', generation.id)
      .eq('status', 'processing')

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
