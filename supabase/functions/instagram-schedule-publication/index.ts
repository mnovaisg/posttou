// Edge Function: ações autenticadas do usuário sobre publicação real no
// Instagram (Fase 7) — agendar, publicar agora, cancelar, reagendar.
// O worker (instagram-publish-worker) nunca é chamado pelo navegador
// diretamente; esta função só enfileira (insere/atualiza linhas) e, no
// caso de "publicar agora", acorda o worker uma vez para reduzir
// latência — o cron continua sendo o mecanismo confiável de garantia.
//
// O asset final (render do editor) já deve estar renderizado e
// persistido em content-assets ANTES desta chamada — esta função só
// valida que os paths pertencem ao workspace/conteúdo certos, nunca
// gera nem confia em URL pública.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const MAX_CAROUSEL_ITEMS = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

  const body = await req.json().catch(() => null)
  const action = (body as Record<string, unknown> | null)?.action

  try {
    if (action === 'schedule' || action === 'publish_now') {
      return await handleSchedule(userClient, admin, body as Record<string, unknown>, action === 'publish_now', userData.user.id)
    }
    if (action === 'cancel') {
      return await handleCancel(userClient, admin, body as Record<string, unknown>)
    }
    if (action === 'reschedule') {
      return await handleReschedule(userClient, admin, body as Record<string, unknown>)
    }
    return json({ error: 'invalid_action' }, 400)
  } catch (err) {
    console.error('instagram-schedule-publication: erro inesperado.', err)
    return json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function handleSchedule(userClient: any, admin: any, body: Record<string, unknown>, isPublishNow: boolean, userId: string) {
  const contentId = body.contentId as string | undefined
  const instagramAccountId = body.instagramAccountId as string | undefined
  const contentVersionId = body.contentVersionId as string | undefined
  const renderedAssetPaths = body.renderedAssetPaths as string[] | undefined
  const scheduledAtInput = body.scheduledAt as string | undefined

  if (!contentId || !instagramAccountId || !contentVersionId || !renderedAssetPaths?.length) {
    return json({ error: 'missing_params', message: 'Parâmetros obrigatórios ausentes.' }, 400)
  }

  const { data: content, error: contentError } = await userClient
    .from('contents')
    .select('*')
    .eq('id', contentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (contentError || !content) return json({ error: 'not_found', message: 'Conteúdo não encontrado.' }, 404)

  if (!['aprovado', 'falhou'].includes(content.status)) {
    return json({ error: 'invalid_state', message: 'Só é possível agendar/publicar conteúdo aprovado (ou tentar de novo um conteúdo que falhou).' }, 409)
  }
  if (content.type === 'reel') {
    return json({ error: 'format_not_supported', message: 'Reels ainda não é suportado (sem pipeline de vídeo real).' }, 400)
  }
  if (content.type === 'carrossel' && (renderedAssetPaths.length < 2 || renderedAssetPaths.length > MAX_CAROUSEL_ITEMS)) {
    return json({ error: 'invalid_carousel_size', message: `Carrossel precisa ter entre 2 e ${MAX_CAROUSEL_ITEMS} imagens.` }, 400)
  }
  if (content.type === 'post' && renderedAssetPaths.length !== 1) {
    return json({ error: 'invalid_asset_count', message: 'Post único precisa de exatamente 1 imagem renderizada.' }, 400)
  }

  const expectedPrefix = `${content.workspace_id}/${contentId}/`
  if (renderedAssetPaths.some((p) => !p.startsWith(expectedPrefix))) {
    return json({ error: 'invalid_asset_path', message: 'Asset renderizado não pertence a este conteúdo/workspace.' }, 400)
  }

  const { data: version, error: versionError } = await userClient
    .from('content_versions')
    .select('id')
    .eq('id', contentVersionId)
    .eq('content_id', contentId)
    .maybeSingle()
  if (versionError || !version) return json({ error: 'invalid_version', message: 'Versão de conteúdo inválida.' }, 400)

  const { data: account, error: accountError } = await userClient
    .from('instagram_accounts')
    .select('id, workspace_id, status')
    .eq('id', instagramAccountId)
    .eq('workspace_id', content.workspace_id)
    .maybeSingle()
  if (accountError || !account) return json({ error: 'invalid_account', message: 'Conta do Instagram inválida para este workspace.' }, 400)
  if (account.status !== 'conectado') {
    return json({ error: 'reauthorization_required', message: 'Reconecte sua conta do Instagram para publicar.' }, 409)
  }

  if (isPublishNow) {
    const { data: isOwnerAdmin } = await userClient.rpc('has_workspace_role', {
      p_workspace_id: content.workspace_id,
      p_roles: ['owner', 'admin'],
    })
    if (!isOwnerAdmin) return json({ error: 'forbidden', message: 'Só owner/admin pode publicar imediatamente.' }, 403)
  }

  const scheduledAt = isPublishNow ? new Date() : new Date(scheduledAtInput ?? '')
  if (isNaN(scheduledAt.getTime())) return json({ error: 'invalid_scheduled_at', message: 'Data/hora inválida.' }, 400)

  const { data: publication, error: insertError } = await admin
    .from('instagram_publications')
    .insert({
      content_id: contentId,
      instagram_account_id: instagramAccountId,
      content_version_id: contentVersionId,
      rendered_asset_paths: renderedAssetPaths,
      requested_by: userId,
      status: 'pending',
    })
    .select('*')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return json({ error: 'already_active', message: 'Já existe uma publicação em andamento para este conteúdo.' }, 409)
    }
    console.error('instagram-schedule-publication: falha ao inserir publicação.', insertError)
    return json({ error: 'internal_error' }, 500)
  }

  const { error: transitionError } = await userClient
    .from('contents')
    .update({ status: 'agendado', scheduled_at: scheduledAt.toISOString() })
    .eq('id', contentId)

  if (transitionError) {
    await admin.from('instagram_publications').delete().eq('id', publication.id)
    return json({ error: 'transition_failed', message: transitionError.message }, 409)
  }

  await userClient.rpc('log_audit_event', {
    p_workspace_id: content.workspace_id,
    p_action: isPublishNow ? 'instagram_publish_requested' : 'instagram_publish_scheduled',
    p_resource_type: 'instagram_publications',
    p_resource_id: publication.id,
    p_metadata: { content_id: contentId, scheduled_at: scheduledAt.toISOString(), instagram_account_id: instagramAccountId },
  })

  if (isPublishNow) {
    const workerSecret = Deno.env.get('INSTAGRAM_PUBLISH_WORKER_SECRET')
    if (workerSecret) {
      const wake = fetch(`${supabaseFunctionsUrl()}/instagram-publish-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-posttou-cron-secret': workerSecret },
        body: '{}',
      }).catch((err) => console.error('instagram-schedule-publication: falha ao acordar o worker.', err))
      // @ts-ignore — EdgeRuntime existe no runtime das Edge Functions do Supabase.
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(wake)
      else await wake
    }
  }

  return json({ success: true, publicationId: publication.id, scheduledAt: scheduledAt.toISOString() })
}

// deno-lint-ignore no-explicit-any
async function handleCancel(userClient: any, admin: any, body: Record<string, unknown>) {
  const contentId = body.contentId as string | undefined
  if (!contentId) return json({ error: 'missing_params' }, 400)

  const { data: content, error: contentError } = await userClient.from('contents').select('*').eq('id', contentId).maybeSingle()
  if (contentError || !content) return json({ error: 'not_found' }, 404)
  if (content.status !== 'agendado') return json({ error: 'invalid_state', message: 'Conteúdo não está agendado.' }, 409)

  const { data: cancelled, error: cancelError } = await admin
    .from('instagram_publications')
    .update({ status: 'cancelled' })
    .eq('content_id', contentId)
    .eq('status', 'pending')
    .is('claimed_at', null)
    .select('id')
    .maybeSingle()

  if (cancelError) return json({ error: 'internal_error' }, 500)
  if (!cancelled) {
    return json({ error: 'already_processing', message: 'A publicação já está em processamento e não pode mais ser cancelada.' }, 409)
  }

  const { error: transitionError } = await userClient.from('contents').update({ status: 'aprovado' }).eq('id', contentId)
  if (transitionError) return json({ error: 'transition_failed', message: transitionError.message }, 409)

  await userClient.rpc('log_audit_event', {
    p_workspace_id: content.workspace_id,
    p_action: 'instagram_publish_cancelled',
    p_resource_type: 'instagram_publications',
    p_resource_id: cancelled.id,
    p_metadata: { content_id: contentId },
  })

  return json({ success: true })
}

// deno-lint-ignore no-explicit-any
async function handleReschedule(userClient: any, admin: any, body: Record<string, unknown>) {
  const contentId = body.contentId as string | undefined
  const scheduledAtInput = body.scheduledAt as string | undefined
  if (!contentId || !scheduledAtInput) return json({ error: 'missing_params' }, 400)

  const scheduledAt = new Date(scheduledAtInput)
  if (isNaN(scheduledAt.getTime())) return json({ error: 'invalid_scheduled_at' }, 400)

  const { data: content, error: contentError } = await userClient.from('contents').select('*').eq('id', contentId).maybeSingle()
  if (contentError || !content) return json({ error: 'not_found' }, 404)
  if (content.status !== 'agendado') return json({ error: 'invalid_state', message: 'Conteúdo não está agendado.' }, 409)

  // Lock: só reagenda enquanto a publicação ainda não foi reivindicada
  // pelo worker (claimed_at is null). A checagem+update é atômica no
  // banco — se o worker reivindicar entre o check e o update do
  // usuário, esta condição simplesmente não casa nenhuma linha.
  const { data: locked, error: lockError } = await admin
    .from('instagram_publications')
    .select('id')
    .eq('content_id', contentId)
    .eq('status', 'pending')
    .is('claimed_at', null)
    .maybeSingle()

  if (lockError) return json({ error: 'internal_error' }, 500)
  if (!locked) {
    return json({ error: 'already_processing', message: 'A publicação já está em processamento e não pode mais ser reagendada.' }, 409)
  }

  const { error: updateError } = await userClient.from('contents').update({ scheduled_at: scheduledAt.toISOString() }).eq('id', contentId)
  if (updateError) return json({ error: 'update_failed', message: updateError.message }, 409)

  await userClient.rpc('log_audit_event', {
    p_workspace_id: content.workspace_id,
    p_action: 'instagram_publish_rescheduled',
    p_resource_type: 'instagram_publications',
    p_resource_id: locked.id,
    p_metadata: { content_id: contentId, scheduled_at: scheduledAt.toISOString() },
  })

  return json({ success: true })
}

function supabaseFunctionsUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1`
}
