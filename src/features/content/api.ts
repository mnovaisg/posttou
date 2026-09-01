import { supabase } from '@/lib/supabase/client'
import { DEFAULT_FORMAT_BY_TYPE, PAGE_DIMENSIONS_BY_FORMAT } from '@/features/content/types'
import type { ContentFilters, ContentRow, ContentStatus, ContentType } from '@/features/content/types'
import type { Database } from '@/types/database'

const PAGE_SIZE = 24
const SIGNED_URL_TTL_SECONDS = 60 * 60

type ContentPageRow = Database['public']['Tables']['content_pages']['Row']

export interface ListContentsResult {
  rows: ContentRow[]
  count: number
}

export async function listContents(
  workspaceId: string,
  filters: ContentFilters,
  page: number,
): Promise<ListContentsResult> {
  let query = supabase
    .from('contents')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (filters.search.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, '')
    query = query.or(`title.ilike.%${term}%,caption.ilike.%${term}%`)
  }
  if (filters.status !== 'todos') query = query.eq('status', filters.status)
  if (filters.type !== 'todos') query = query.eq('type', filters.type)
  if (filters.origin !== 'todos') query = query.eq('origin', filters.origin)

  const range = periodToRange(filters)
  if (range) {
    query = query.gte('scheduled_at', range.start).lte('scheduled_at', range.end)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], count: count ?? 0 }
}

function periodToRange(filters: ContentFilters): { start: string; end: string } | null {
  const now = new Date()
  if (filters.period === 'hoje') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  if (filters.period === '7dias') {
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return { start: now.toISOString(), end: end.toISOString() }
  }
  if (filters.period === '30dias') {
    const end = new Date(now)
    end.setDate(end.getDate() + 30)
    return { start: now.toISOString(), end: end.toISOString() }
  }
  if (filters.period === 'personalizado' && filters.periodStart && filters.periodEnd) {
    return { start: filters.periodStart, end: filters.periodEnd }
  }
  return null
}

export async function getContent(id: string): Promise<ContentRow | null> {
  const { data, error } = await supabase.from('contents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createContent(workspaceId: string, type: ContentType): Promise<ContentRow> {
  const format = DEFAULT_FORMAT_BY_TYPE[type]
  const { data, error } = await supabase
    .from('contents')
    .insert({ workspace_id: workspaceId, type, format, title: defaultTitle(type), origin: 'manual' })
    .select('*')
    .single()
  if (error) throw error

  const dims = PAGE_DIMENSIONS_BY_FORMAT[format]
  const { error: pageError } = await supabase.from('content_pages').insert({
    content_id: data.id,
    position: 0,
    width: dims.width,
    height: dims.height,
  })
  if (pageError) throw pageError

  return data
}

function defaultTitle(type: ContentType): string {
  const now = new Date()
  const label = { post: 'Post', carrossel: 'Carrossel', reel: 'Reel' }[type]
  return `${label} — ${now.toLocaleDateString('pt-BR')}`
}

export async function updateContent(id: string, patch: Partial<ContentRow>): Promise<ContentRow> {
  const { data, error } = await supabase.from('contents').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function transitionStatus(
  id: string,
  status: ContentStatus,
  extra: { rejection_reason?: string; scheduled_at?: string | null } = {},
): Promise<ContentRow> {
  const { data, error } = await supabase
    .from('contents')
    .update({ status, ...extra })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function duplicateContent(original: ContentRow): Promise<ContentRow> {
  const { data: newContent, error } = await supabase
    .from('contents')
    .insert({
      workspace_id: original.workspace_id,
      title: `${original.title} (cópia)`,
      type: original.type,
      format: original.format,
      caption: original.caption,
      hashtags: original.hashtags,
      cta: original.cta,
      origin: 'manual',
      status: 'rascunho',
      duplicated_from: original.id,
    })
    .select('*')
    .single()
  if (error) throw error

  const { data: pages, error: pagesError } = await supabase
    .from('content_pages')
    .select('*')
    .eq('content_id', original.id)
    .order('position', { ascending: true })
  if (pagesError) throw pagesError

  for (const page of pages ?? []) {
    const { data: newPage, error: newPageError } = await supabase
      .from('content_pages')
      .insert({
        content_id: newContent.id,
        position: page.position,
        background_color: page.background_color,
        width: page.width,
        height: page.height,
      })
      .select('*')
      .single()
    if (newPageError) throw newPageError

    const { data: elements, error: elementsError } = await supabase
      .from('content_elements')
      .select('*')
      .eq('page_id', page.id)
    if (elementsError) throw elementsError

    for (const el of elements ?? []) {
      const { error: newElError } = await supabase.from('content_elements').insert({
        page_id: newPage.id,
        type: el.type,
        position_x: el.position_x,
        position_y: el.position_y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        z_index: el.z_index,
        content: el.content,
        style: el.style,
      })
      if (newElError) throw newElError
    }
  }

  return newContent
}

export async function softDeleteContent(id: string): Promise<void> {
  // Update direto falha por RLS: a policy de SELECT esconde linhas com
  // deleted_at preenchido, e o Postgres exige que a linha resultante de um
  // UPDATE continue visível por essa policy. Por isso a escrita passa por
  // uma função SECURITY DEFINER (mesmo padrão de consume_credits).
  const { error } = await supabase.rpc('soft_delete_content', { p_content_id: id })
  if (error) throw error
}

export async function listContentsForCalendarRange(
  workspaceId: string,
  startIso: string,
  endIso: string,
): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from('contents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', startIso)
    .lte('scheduled_at', endIso)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export interface ContentSummary {
  total: number
  rascunho: number
  agendado: number
  publicado: number
}

export async function getContentSummary(workspaceId: string): Promise<ContentSummary> {
  const base = () => supabase.from('contents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)

  const [total, rascunho, agendado, publicado] = await Promise.all([
    base(),
    base().eq('status', 'rascunho'),
    base().eq('status', 'agendado'),
    base().eq('status', 'publicado'),
  ])

  return {
    total: total.count ?? 0,
    rascunho: rascunho.count ?? 0,
    agendado: agendado.count ?? 0,
    publicado: publicado.count ?? 0,
  }
}

export async function getContentPages(contentId: string) {
  const { data, error } = await supabase
    .from('content_pages')
    .select('*')
    .eq('content_id', contentId)
    .order('position', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Resolve, em lote (nunca 1 request por página), a URL assinada da arte
 * final de cada página que já tem imagem pronta (visual_asset_status
 * 'ready'). content-assets é bucket privado — nunca expõe a URL pública
 * do Storage, só signed URLs de curta duração. Qualquer falha em qualquer
 * etapa (geração não encontrada, sem asset, erro ao assinar) simplesmente
 * omite a página do mapa — quem chama trata a ausência como fallback, não
 * como erro fatal.
 */
export async function getContentPageThumbnails(pages: ContentPageRow[]): Promise<Record<string, string>> {
  const generationIds = Array.from(
    new Set(
      pages
        .filter((page) => page.visual_asset_status === 'ready' && page.visual_ai_generation_id)
        .map((page) => page.visual_ai_generation_id as string),
    ),
  )
  if (!generationIds.length) return {}

  const { data: generations } = await supabase.from('ai_generations').select('id, result_asset_paths').in('id', generationIds)
  if (!generations?.length) return {}

  const pathByGenerationId = new Map<string, string>()
  for (const generation of generations) {
    const path = generation.result_asset_paths[0]
    if (path) pathByGenerationId.set(generation.id, path)
  }
  if (!pathByGenerationId.size) return {}

  const paths = Array.from(new Set(pathByGenerationId.values()))
  const { data: signedUrls } = await supabase.storage.from('content-assets').createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (!signedUrls?.length) return {}

  const urlByPath = new Map<string, string>()
  for (const item of signedUrls) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl)
  }

  const urlByPageId: Record<string, string> = {}
  for (const page of pages) {
    const path = page.visual_ai_generation_id ? pathByGenerationId.get(page.visual_ai_generation_id) : undefined
    const url = path ? urlByPath.get(path) : undefined
    if (url) urlByPageId[page.id] = url
  }
  return urlByPageId
}

/**
 * Mesma resolução em lote de getContentPageThumbnails, mas para a capa
 * (position 0) de vários conteúdos de uma vez — usado pelos cards da
 * Grade. Sempre 3 queries no total (content_pages, ai_generations,
 * signed URLs), nunca 1 por card.
 */
export async function getContentCoverThumbnails(contentIds: string[]): Promise<Record<string, string>> {
  if (!contentIds.length) return {}

  const { data: coverPages } = await supabase
    .from('content_pages')
    .select('*')
    .in('content_id', contentIds)
    .eq('position', 0)
  if (!coverPages?.length) return {}

  const urlByPageId = await getContentPageThumbnails(coverPages)

  const urlByContentId: Record<string, string> = {}
  for (const page of coverPages) {
    const url = urlByPageId[page.id]
    if (url) urlByContentId[page.content_id] = url
  }
  return urlByContentId
}
