import { supabase } from '@/lib/supabase/client'
import { DEFAULT_FORMAT_BY_TYPE, PAGE_DIMENSIONS_BY_FORMAT } from '@/features/content/types'
import type { ContentOrigin, ContentRow, ContentType } from '@/features/content/types'
import type {
  AiGenerateResponse,
  CarrosselGenerationResult,
  GenerationType,
  Objective,
  ReelsGenerationResult,
  TextGenerationResult,
} from '@/features/ai-generate/types'

export interface GenerateWithAiParams {
  workspaceId: string
  generationType: GenerationType
  themeInput: string
  objective?: Objective
  format?: string
}

export class AiNotConfiguredError extends Error {}

/**
 * Chama a Edge Function ai-generate (AI Gateway). Nunca envia custo — o
 * preço é sempre decidido pelo servidor a partir de ai_operation_costs.
 */
export async function generateWithAi(params: GenerateWithAiParams): Promise<AiGenerateResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      generationType: params.generationType,
      themeInput: params.themeInput,
      objective: params.objective,
      format: params.format,
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    if (res.status === 501) throw new AiNotConfiguredError(body.message ?? 'Geração com IA não configurada.')
    throw new Error(body.error ?? 'Não foi possível gerar o conteúdo agora.')
  }
  return body as AiGenerateResponse
}

export async function fetchOperationCosts(): Promise<Record<GenerationType, number>> {
  const { data, error } = await supabase.from('ai_operation_costs').select('generation_type, credit_cost')
  if (error) throw error
  const map = {} as Record<GenerationType, number>
  // performance_insight (Fase 10) não é um tipo selecionável em "Criar com
  // IA" — nunca aparece neste mapa de preços exibido ao usuário aqui.
  for (const row of data ?? []) {
    if (row.generation_type === 'performance_insight') continue
    map[row.generation_type] = row.credit_cost
  }
  return map
}

export async function fetchCreditBalance(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.from('credit_accounts').select('balance').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw error
  return data?.balance ?? 0
}

const CONTENT_TYPE_BY_GENERATION: Partial<Record<GenerationType, ContentType>> = {
  post_unico: 'post',
  carrossel: 'carrossel',
  reels_roteiro: 'reel',
  legenda: 'post',
}

/**
 * Salva o resultado de uma geração de IA como rascunho, reaproveitando o
 * mesmo modelo de conteúdo (contents/content_pages/content_elements) usado
 * pela criação manual. origin é 'ia' por padrão; quando a ideia veio do
 * Radar Viral (Fase 8), o chamador passa origin='radar' + radarOpportunityId
 * para rastreabilidade (content.radar_opportunity_id) e para marcar a
 * oportunidade como 'used' via link_radar_opportunity_content.
 */
export async function saveAiGenerationAsDraft(
  workspaceId: string,
  generationId: string,
  generationType: GenerationType,
  result: TextGenerationResult | CarrosselGenerationResult | ReelsGenerationResult,
  themeInput: string,
  origin: ContentOrigin = 'ia',
  radarOpportunityId?: string,
): Promise<ContentRow> {
  const type = CONTENT_TYPE_BY_GENERATION[generationType]
  if (!type) throw new Error('Este tipo de geração não gera um rascunho diretamente.')

  const format = DEFAULT_FORMAT_BY_TYPE[type]
  const title = themeInput.length > 60 ? `${themeInput.slice(0, 57)}...` : themeInput

  const { data: content, error } = await supabase
    .from('contents')
    .insert({
      workspace_id: workspaceId,
      type,
      format,
      title,
      origin,
      caption: result.caption,
      hashtags: result.hashtags,
      cta: result.cta,
    })
    .select('*')
    .single()
  if (error) throw error

  if (radarOpportunityId) {
    const { error: linkError } = await supabase.rpc('link_radar_opportunity_content', {
      p_opportunity_id: radarOpportunityId,
      p_content_id: content.id,
    })
    if (linkError) throw linkError
  }

  const dims = PAGE_DIMENSIONS_BY_FORMAT[format]

  if ('slides' in result && result.slides.length) {
    for (let i = 0; i < result.slides.length; i++) {
      const { data: page, error: pageError } = await supabase
        .from('content_pages')
        .insert({ content_id: content.id, position: i, width: dims.width, height: dims.height })
        .select('*')
        .single()
      if (pageError) throw pageError

      const { error: elError } = await supabase.from('content_elements').insert({
        page_id: page.id,
        type: 'text',
        position_x: 80,
        position_y: 80,
        width: dims.width - 160,
        height: dims.height - 160,
        content: { text: result.slides[i] },
      })
      if (elError) throw elError
    }
  } else {
    const { data: page, error: pageError } = await supabase
      .from('content_pages')
      .insert({ content_id: content.id, position: 0, width: dims.width, height: dims.height })
      .select('*')
      .single()
    if (pageError) throw pageError

    if ('script' in result) {
      const scriptText = `${result.script.hook}\n\n${result.script.development}\n\n${result.script.closing}`
      const { error: elError } = await supabase.from('content_elements').insert({
        page_id: page.id,
        type: 'text',
        position_x: 80,
        position_y: 80,
        width: dims.width - 160,
        height: dims.height - 160,
        content: { text: scriptText },
      })
      if (elError) throw elError
    }
  }

  const { error: linkError } = await supabase.rpc('link_ai_generation_content', {
    p_generation_id: generationId,
    p_content_id: content.id,
  })
  if (linkError) throw linkError

  return content
}
