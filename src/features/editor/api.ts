import { supabase } from '@/lib/supabase/client'
import type { ContentRow, EditorElement, EditorPage } from '@/features/editor/types'
import type { Json } from '@/types/database'

export async function loadEditorPages(contentId: string): Promise<EditorPage[]> {
  const { data: pages, error: pagesError } = await supabase
    .from('content_pages')
    .select('*')
    .eq('content_id', contentId)
    .order('position', { ascending: true })
  if (pagesError) throw pagesError

  const { data: elements, error: elementsError } = await supabase
    .from('content_elements')
    .select('*')
    .in('page_id', (pages ?? []).map((p) => p.id))
    .order('z_index', { ascending: true })
  if (elementsError) throw elementsError

  return (pages ?? []).map((page) => ({
    ...page,
    elements: (elements ?? [])
      .filter((el) => el.page_id === page.id)
      .map((el) => el as unknown as EditorElement),
  }))
}

export async function getContent(contentId: string): Promise<ContentRow | null> {
  const { data, error } = await supabase.from('contents').select('*').eq('id', contentId).maybeSingle()
  if (error) throw error
  return data
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function getContentAssetSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('content-assets').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

export async function uploadContentImage(workspaceId: string, contentId: string, file: File): Promise<string> {
  const MAX_BYTES = 15 * 1024 * 1024
  if (file.size > MAX_BYTES) throw new Error('Arquivo maior que 15MB.')
  const allowed = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowed.includes(file.type)) throw new Error('Formato não suportado (use PNG, JPG ou WEBP).')

  const ext = file.name.split('.').pop() || 'png'
  const path = `${workspaceId}/${contentId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from('content-assets').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new Error(`Falha no upload: ${error.message}`)

  return path
}

export interface SavePagesInput {
  contentId: string
  pages: EditorPage[]
}

/**
 * Persiste páginas e elementos. Faz diff simples: páginas/elementos
 * marcados isNew são inseridos; os demais são upsert; os removidos (que
 * existiam no banco mas não vieram mais na lista) são deletados. Chamado
 * apenas em save explícito/autosave — nunca a cada movimento.
 */
export async function saveEditorPages({ contentId, pages }: SavePagesInput): Promise<EditorPage[]> {
  const { data: existingPages } = await supabase.from('content_pages').select('id').eq('content_id', contentId)
  const existingPageIds = new Set((existingPages ?? []).map((p) => p.id))
  const keptPageIds = new Set(pages.filter((p) => !p.isNew).map((p) => p.id))
  const pagesToDelete = [...existingPageIds].filter((id) => !keptPageIds.has(id))
  if (pagesToDelete.length) {
    await supabase.from('content_pages').delete().in('id', pagesToDelete)
  }

  const result: EditorPage[] = []

  for (const page of pages) {
    let pageId = page.id
    if (page.isNew) {
      const { data, error } = await supabase
        .from('content_pages')
        .insert({
          content_id: contentId,
          position: page.position,
          background_color: page.background_color,
          width: page.width,
          height: page.height,
        })
        .select('*')
        .single()
      if (error) throw error
      pageId = data.id
    } else {
      const { error } = await supabase
        .from('content_pages')
        .update({
          position: page.position,
          background_color: page.background_color,
          width: page.width,
          height: page.height,
        })
        .eq('id', pageId)
      if (error) throw error
    }

    const { data: existingElements } = await supabase.from('content_elements').select('id').eq('page_id', pageId)
    const existingElementIds = new Set((existingElements ?? []).map((e) => e.id))
    const keptElementIds = new Set(page.elements.filter((e) => !e.isNew).map((e) => e.id))
    const elementsToDelete = [...existingElementIds].filter((id) => !keptElementIds.has(id))
    if (elementsToDelete.length) {
      await supabase.from('content_elements').delete().in('id', elementsToDelete)
    }

    const savedElements: EditorElement[] = []
    for (const el of page.elements) {
      const payload = {
        page_id: pageId,
        type: el.type,
        position_x: el.position_x,
        position_y: el.position_y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        z_index: el.z_index,
        locked: el.locked,
        hidden: el.hidden,
        content: el.content as unknown as Json,
        style: el.style as unknown as Json,
      }
      if (el.isNew) {
        const { data, error } = await supabase.from('content_elements').insert(payload).select('*').single()
        if (error) throw error
        savedElements.push({ ...(data as unknown as EditorElement) })
      } else {
        const { data, error } = await supabase.from('content_elements').update(payload).eq('id', el.id).select('*').single()
        if (error) throw error
        savedElements.push({ ...(data as unknown as EditorElement) })
      }
    }

    result.push({ ...page, id: pageId, isNew: false, elements: savedElements })
  }

  return result
}

/**
 * Snapshot em content_versions após um save significativo — mesmo padrão
 * já usado pelo trigger de auditoria de conteúdo (audit_content_changes),
 * aqui explícito porque a granularidade de "o que é uma versão" no editor
 * é decidida pelo save do editor, não por todo UPDATE da tabela contents.
 */
export async function snapshotContentVersion(contentId: string, pages: EditorPage[]): Promise<string> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('content_versions')
    .insert({
      content_id: contentId,
      created_by: userData.user?.id ?? null,
      snapshot: { pages } as unknown as Json,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function logEditorAudit(
  workspaceId: string,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await supabase.rpc('log_audit_event', {
    p_workspace_id: workspaceId,
    p_action: action,
    p_resource_type: 'contents',
    p_resource_id: resourceId,
    p_metadata: metadata as unknown as Json,
  })
}

export interface GenerateImageParams {
  workspaceId: string
  contentId: string
  prompt: string
  format: string
}

export interface GenerateImageResponse {
  generationId: string
  taskId: string
  creditCost: number
}

export class AiNotConfiguredError extends Error {}

export async function generateImageWithAi(params: GenerateImageParams): Promise<GenerateImageResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId: params.workspaceId, contentId: params.contentId, prompt: params.prompt, format: params.format }),
  })
  const body = await res.json()
  if (!res.ok) {
    if (res.status === 501) throw new AiNotConfiguredError(body.message ?? 'Geração de imagem não configurada.')
    throw new Error(body.error ?? 'Não foi possível iniciar a geração de imagem.')
  }
  return body as GenerateImageResponse
}

export interface CheckImageGenerationResponse {
  status: 'processing' | 'success' | 'failed'
  resultAssetPaths: string[]
  errorMessage: string | null
}

export async function checkImageGeneration(generationId: string): Promise<CheckImageGenerationResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-check-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ generationId }),
  })
  const body = await res.json()
  if (!res.ok) {
    if (res.status === 501) throw new AiNotConfiguredError(body.message ?? 'Geração de imagem não configurada.')
    throw new Error(body.error ?? 'Não foi possível verificar a geração.')
  }
  return body as CheckImageGenerationResponse
}
