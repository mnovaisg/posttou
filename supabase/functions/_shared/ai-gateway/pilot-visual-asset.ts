// Fase 13 — geração de arte automática de UMA página de conteúdo do
// Piloto. Único lugar que monta o prompt de imagem do Piloto (ajuste 6:
// reaproveita literalmente brandProfileToPromptText/visualDnaToPromptText/
// referencesToPromptText/ANTI_COPY_INSTRUCTION da Fase 12 — nunca
// duplicado) e chama o AI Gateway de imagem. Usado por 3 chamadores:
// pilot-content-generate (tentativa inicial), pilot-visual-asset-retry
// (retry manual, owner/admin) e a etapa de auto-retry do
// pilot-cron-dispatcher — todos reaproveitam esta mesma função, nenhum
// duplica a lógica de crédito/prompt/task (ajuste 6/11).
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AsyncMediaProvider } from './types.ts'
import { ProviderRequestError } from './types.ts'
import { brandProfileToPromptText } from './brand-context.ts'
import { ANTI_COPY_INSTRUCTION, referencesToPromptText, visualDnaToPromptText, type ReferenceForPrompt, type VisualDnaAttributes } from './visual-dna-context.ts'

export interface PilotVisualAssetParams {
  admin: SupabaseClient<any>
  mediaProvider: AsyncMediaProvider
  supabaseUrl: string
  workspaceId: string
  pageId: string
  contentId: string
  /** Título/tema/legenda do conteúdo — único dado específico desta peça no prompt. */
  contentContext: string
}

export interface PilotVisualAssetResult {
  ok: boolean
  generationId?: string
  errorCode?: string
  errorMessage?: string
}

// A 4o-image não tem '4:5' nativo — Piloto só usa este formato (mesmo
// mapeamento já documentado/testado em ai-generate-image).
const PILOT_IMAGE_SIZE = '2:3'

export async function generatePilotVisualAsset(params: PilotVisualAssetParams): Promise<PilotVisualAssetResult> {
  const { admin, mediaProvider, supabaseUrl, workspaceId, pageId, contentId, contentContext } = params

  const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle()
  const brandText = brandProfileToPromptText(brandProfile ?? null)

  // Ajuste 7: arte automática NUNCA depende de DNA Visual/referências
  // existirem — se não existirem, os blocos abaixo ficam vazios e o
  // prompt segue só com Brand DNA + contexto do conteúdo (defaults
  // seguros do pipeline já existente).
  const { data: activeVisualDna } = await admin
    .from('brand_visual_dna')
    .select('attributes')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  const visualDnaText = visualDnaToPromptText((activeVisualDna?.attributes ?? null) as VisualDnaAttributes | null)

  const { data: referenceRows } = await admin
    .from('brand_reference_profiles')
    .select('handle, reference_type, liked_aspects, notes, status, analysis')
    .eq('workspace_id', workspaceId)
    .is('removed_at', null)
  const referencesText = referencesToPromptText((referenceRows ?? []) as ReferenceForPrompt[])

  const contextBlocks = [
    brandProfile ? `Contexto da marca (use para guiar estilo/identidade visual quando relevante):\n${brandText}` : '',
    visualDnaText,
    referencesText,
  ].filter(Boolean)

  const fullPrompt = [
    ...contextBlocks,
    ANTI_COPY_INSTRUCTION,
    `Crie a arte para este conteúdo de Instagram:\n${contentContext}`,
  ].join('\n\n')

  const { data: costRow } = await admin.from('ai_operation_costs').select('credit_cost').eq('generation_type', 'imagem').single()
  const creditCost = (costRow?.credit_cost as number) ?? 15

  const { data: generationRow, error: insertError } = await admin
    .from('ai_generations')
    .insert({
      workspace_id: workspaceId,
      user_id: null,
      content_id: contentId,
      generation_type: 'imagem',
      format: '4:5',
      theme_input: contentContext.slice(0, 500),
      brand_context_snapshot: brandProfile ?? {},
      provider: mediaProvider.name,
      model: 'gpt4o-image',
      status: 'pending',
      request_payload: { prompt: fullPrompt, size: PILOT_IMAGE_SIZE, pilot_page_id: pageId },
      credit_cost: creditCost,
    })
    .select('id')
    .single()
  if (insertError || !generationRow) {
    await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: pageId, p_reason: 'ai_generation_insert_failed' })
    return { ok: false, errorCode: 'ai_generation_insert_failed' }
  }
  const generationId = generationRow.id as string

  const { data: ledgerRow, error: creditError } = await admin.rpc('consume_credits_system', {
    p_workspace_id: workspaceId,
    p_amount: creditCost,
    p_operation: 'ai_generation',
    p_reference_type: 'ai_generations',
    p_reference_id: generationId,
    p_metadata: { pilot_page_id: pageId },
  })
  if (creditError || !ledgerRow) {
    // Nunca passou por 'processing' — o trigger de propagação não
    // dispara pra este caso, por isso o bookkeeping é feito direto aqui.
    await admin.from('ai_generations').update({ status: 'failed', error_code: 'insufficient_credits', completed_at: new Date().toISOString() }).eq('id', generationId)
    await admin.rpc('pilot_mark_visual_asset_failed', { p_page_id: pageId, p_reason: 'insufficient_credits' })
    return { ok: false, generationId, errorCode: 'insufficient_credits' }
  }

  await admin.from('ai_generations').update({ status: 'processing', credit_ledger_id: ledgerRow.id }).eq('id', generationId)

  // Liga a página a esta geração ANTES de chamar o provider — o trigger de
  // propagação (sync_content_page_visual_asset) só encontra a página pelo
  // FK visual_ai_generation_id; se createTask() falhar antes deste link
  // existir, a atualização de ai_generations para 'failed' não teria como
  // achar a página, e ela ficaria presa em 'pending' pra sempre.
  await admin.rpc('pilot_mark_visual_asset_generating', { p_page_id: pageId, p_ai_generation_id: generationId })

  try {
    const task = await mediaProvider.createTask({
      model: 'gpt4o-image',
      input: { prompt: fullPrompt, size: PILOT_IMAGE_SIZE },
      callbackUrl: `${supabaseUrl}/functions/v1/ai-webhook`,
    })
    await admin.from('ai_generations').update({ task_id: task.taskId }).eq('id', generationId)
    return { ok: true, generationId }
  } catch (err) {
    const message = err instanceof ProviderRequestError ? err.message : 'Erro inesperado ao chamar o provedor de IA.'
    // JÁ passou por 'processing' — esta escrita dispara o trigger de
    // propagação (sync_content_page_visual_asset), que marca a página
    // 'failed' e libera o conteúdo pra revisão se for a última pendente.
    // NUNCA chamar pilot_mark_visual_asset_failed aqui também (dispararia
    // o bookkeeping 2x pra este caso).
    await admin.from('ai_generations').update({ status: 'failed', error_code: 'provider_error', error_message: message, completed_at: new Date().toISOString() }).eq('id', generationId)
    // .rpc() do supabase-js é "thenable", não uma Promise real — nunca tem
    // .catch() encadeável; precisa de try/catch ao redor do await.
    try {
      await admin.rpc('refund_ai_generation_system', { p_generation_id: generationId })
    } catch (refundErr) {
      console.error('generatePilotVisualAsset: falha ao estornar geração.', refundErr)
    }
    return { ok: false, generationId, errorCode: 'provider_error', errorMessage: message }
  }
}
