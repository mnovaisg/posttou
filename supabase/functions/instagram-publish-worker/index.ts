// Edge Function: worker de publicação real no Instagram (Fase 7).
// Chamado por pg_cron (via pg_net) a cada minuto — NUNCA pelo
// navegador. Publica no máximo o que já foi renderizado e persistido
// (rendered_asset_paths) no momento do agendamento; a URL assinada do
// Storage é gerada só agora, sob demanda, com TTL curto (nunca antes,
// nunca permanente).
//
// Reconciliação: cada item claimed é reprocessado a partir do estado
// já persistido (ig_container_id / carousel_child_container_ids) — nunca
// cria um novo container/publica de novo se já existe um em andamento
// ou concluído. Objetivo: 1 intenção de publicação = no máximo 1 post
// externo.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decryptToken } from '../_shared/instagram/crypto.ts'
import { composeInstagramCaption } from '../_shared/instagram/caption.ts'
import {
  InstagramApiError,
  createCarouselContainer,
  createImageContainer,
  fetchContentPublishingLimit,
  fetchMediaPermalink,
  getContainerStatus,
  publishMediaContainer,
} from '../_shared/instagram/provider.ts'

const RETRY_BACKOFF_MINUTES = [1, 5, 15]
const SIGNED_URL_TTL_SECONDS = 15 * 60

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface PublicationRow {
  id: string
  content_id: string
  instagram_account_id: string
  status: string
  ig_media_id: string | null
  ig_container_id: string | null
  carousel_child_container_ids: string[]
  permalink: string | null
  content_version_id: string | null
  rendered_asset_paths: string[]
  attempt_count: number
}

function isRecoverable(err: unknown): boolean {
  if (err instanceof InstagramApiError) {
    const status = err.status
    if (typeof status === 'number' && (status >= 500 || status === 429)) return true
    // Códigos de erro transitórios documentados da Meta (rate limit /
    // processamento momentâneo) — nunca tratamos erro de permissão/token
    // (ex.: 190) como recuperável.
    return false
  }
  // Erros de rede/timeout do fetch — recuperáveis.
  return true
}

function nextRetryAt(attemptCount: number): { terminal: boolean; nextRetryAt: Date | null } {
  const idx = attemptCount - 1
  if (idx < 0 || idx >= RETRY_BACKOFF_MINUTES.length) return { terminal: true, nextRetryAt: null }
  return { terminal: false, nextRetryAt: new Date(Date.now() + RETRY_BACKOFF_MINUTES[idx] * 60_000) }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('INSTAGRAM_PUBLISH_WORKER_SECRET')
  if (!cronSecret || req.headers.get('x-posttou-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const tokenEncryptionKey = Deno.env.get('INSTAGRAM_TOKEN_ENCRYPTION_KEY')
  const admin = createClient(supabaseUrl, serviceRoleKey)

  if (!tokenEncryptionKey) {
    console.error('instagram-publish-worker: INSTAGRAM_TOKEN_ENCRYPTION_KEY não configurado.')
    return json({ error: 'not_configured' }, 501)
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_instagram_publications', { p_batch_limit: 5 })
  if (claimError) {
    console.error('instagram-publish-worker: falha ao reivindicar publicações.', claimError)
    return json({ error: 'internal_error' }, 500)
  }

  const results: Array<{ id: string; outcome: string }> = []

  for (const row of (claimed ?? []) as PublicationRow[]) {
    try {
      const outcome = await processPublication(admin, row, tokenEncryptionKey)
      results.push({ id: row.id, outcome })
    } catch (err) {
      console.error(`instagram-publish-worker: erro inesperado processando ${row.id}.`, err)
      const { terminal, nextRetryAt: retryAt } = nextRetryAt(row.attempt_count)
      await admin.rpc('fail_instagram_publication', {
        p_publication_id: row.id,
        p_error_code: 'internal_error',
        p_error_message: err instanceof Error ? err.message : 'Erro inesperado.',
        p_terminal: terminal,
        p_next_retry_at: retryAt?.toISOString() ?? null,
      })
      results.push({ id: row.id, outcome: terminal ? 'failed' : 'retry_scheduled' })
    }
  }

  return json({ processed: results.length, results })
})

// deno-lint-ignore no-explicit-any
async function processPublication(admin: any, row: PublicationRow, tokenEncryptionKey: string): Promise<string> {
  const { data: content, error: contentError } = await admin.from('contents').select('*').eq('id', row.content_id).single()
  if (contentError || !content) {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'content_not_found',
      p_error_message: 'Conteúdo associado não foi encontrado.',
      p_terminal: true,
    })
    return 'failed'
  }

  const { data: account, error: accountError } = await admin
    .from('instagram_accounts')
    .select('*')
    .eq('id', row.instagram_account_id)
    .single()

  if (accountError || !account || account.status !== 'conectado' || !account.access_token_encrypted) {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'reauthorization_required',
      p_error_message: 'A conta do Instagram está desconectada ou sem token válido.',
      p_terminal: true,
    })
    await admin.rpc('log_instagram_worker_audit_event', {
      p_workspace_id: content.workspace_id,
      p_action: 'instagram_reauthorization_required',
      p_resource_type: 'instagram_accounts',
      p_resource_id: row.instagram_account_id,
      p_metadata: { content_id: row.content_id },
    }).catch(() => {})
    return 'failed'
  }

  if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
    await admin.from('instagram_accounts').update({ status: 'token_expirado' }).eq('id', account.id)
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'reauthorization_required',
      p_error_message: 'O token de acesso ao Instagram expirou.',
      p_terminal: true,
    })
    await admin.rpc('log_instagram_worker_audit_event', {
      p_workspace_id: content.workspace_id,
      p_action: 'instagram_reauthorization_required',
      p_resource_type: 'instagram_accounts',
      p_resource_id: account.id,
      p_metadata: { content_id: row.content_id, reason: 'token_expired' },
    }).catch(() => {})
    return 'failed'
  }

  if (content.type === 'reel') {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'format_not_supported',
      p_error_message: 'Reels ainda não é suportado nesta fase (pendência real, sem pipeline de vídeo).',
      p_terminal: true,
    })
    return 'failed'
  }

  if (!row.rendered_asset_paths?.length) {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'missing_rendered_asset',
      p_error_message: 'Nenhum asset renderizado foi encontrado para esta publicação.',
      p_terminal: true,
    })
    return 'failed'
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(account.access_token_encrypted, tokenEncryptionKey)
  } catch (err) {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: 'token_decrypt_failed',
      p_error_message: err instanceof Error ? err.message : 'Falha ao decifrar token.',
      p_terminal: true,
    })
    return 'failed'
  }

  const caption = composeInstagramCaption({ caption: content.caption, cta: content.cta, hashtags: content.hashtags })

  try {
    // Se já publicado nesta linha por uma tentativa anterior que travou
    // antes de persistir (não deveria acontecer, dado o claim atômico,
    // mas verificado por segurança): nunca republica.
    if (row.ig_media_id) {
      await admin.rpc('complete_instagram_publication', {
        p_publication_id: row.id,
        p_ig_media_id: row.ig_media_id,
        p_permalink: row.permalink,
      })
      return 'published'
    }

    const isCarousel = content.type === 'carrossel'
    let finalContainerId = row.ig_container_id

    if (isCarousel) {
      let childIds = [...row.carousel_child_container_ids]

      // Verifica o rate limit oficial só quando ainda vamos criar
      // algo novo — nunca em cima de uma reconciliação pura.
      if (childIds.length < row.rendered_asset_paths.length) {
        const limitCheck = await checkRateLimit(account.ig_user_id, accessToken)
        if (limitCheck) return await scheduleRetry(admin, row, 'rate_limited', limitCheck, false, new Date(Date.now() + 60 * 60_000))
      }

      for (let i = childIds.length; i < row.rendered_asset_paths.length; i++) {
        const signedUrl = await getSignedAssetUrl(admin, row.rendered_asset_paths[i])
        const { containerId } = await createImageContainer({
          igUserId: account.ig_user_id,
          accessToken,
          imageUrl: signedUrl,
          isCarouselItem: true,
        })
        childIds.push(containerId)
        await admin.from('instagram_publications').update({ carousel_child_container_ids: childIds }).eq('id', row.id)
      }

      for (const childId of childIds) {
        const { statusCode } = await getContainerStatus({ containerId: childId, accessToken })
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          // Container filho morreu — limpa tudo e recria do zero na
          // próxima tentativa (mais simples e seguro que remendar).
          await admin.from('instagram_publications').update({ carousel_child_container_ids: [] }).eq('id', row.id)
          return await scheduleRetry(admin, row, 'container_error', `Container filho ${childId} falhou (${statusCode}).`, false)
        }
        if (statusCode === 'IN_PROGRESS') {
          return await scheduleRetry(admin, row, 'container_processing', 'Containers do carrossel ainda em processamento.', false, new Date(Date.now() + 30_000))
        }
      }

      if (!finalContainerId) {
        const { containerId } = await createCarouselContainer({
          igUserId: account.ig_user_id,
          accessToken,
          childContainerIds: childIds,
          caption,
        })
        finalContainerId = containerId
        await admin.from('instagram_publications').update({ ig_container_id: finalContainerId, status: 'container_created' }).eq('id', row.id)
      }
    } else {
      if (!finalContainerId) {
        const limitCheck = await checkRateLimit(account.ig_user_id, accessToken)
        if (limitCheck) return await scheduleRetry(admin, row, 'rate_limited', limitCheck, false, new Date(Date.now() + 60 * 60_000))

        const signedUrl = await getSignedAssetUrl(admin, row.rendered_asset_paths[0])
        const { containerId } = await createImageContainer({
          igUserId: account.ig_user_id,
          accessToken,
          imageUrl: signedUrl,
          caption,
        })
        finalContainerId = containerId
        await admin.from('instagram_publications').update({ ig_container_id: finalContainerId, status: 'container_created' }).eq('id', row.id)
      }
    }

    const { statusCode } = await getContainerStatus({ containerId: finalContainerId!, accessToken })
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      await admin.from('instagram_publications').update({ ig_container_id: null, carousel_child_container_ids: [] }).eq('id', row.id)
      return await scheduleRetry(admin, row, 'container_error', `Container final falhou (${statusCode}).`, false)
    }
    if (statusCode === 'IN_PROGRESS') {
      return await scheduleRetry(admin, row, 'container_processing', 'Container ainda em processamento na Meta.', false, new Date(Date.now() + 30_000))
    }
    if (statusCode === 'PUBLISHED') {
      // Etapa 4B — janela real (não só concorrência local): a Meta pode ter
      // processado media_publish com sucesso numa tentativa anterior cuja
      // RESPOSTA se perdeu (timeout/queda de rede entre nós e a Meta depois
      // dela já ter publicado) — aí o worker reagenda um retry achando que
      // falhou. FOR UPDATE SKIP LOCKED só impede duas execuções NOSSAS
      // simultâneas; não impede isto, porque não é concorrência, é resposta
      // perdida de uma chamada que já aconteceu de verdade do lado da Meta.
      // status_code=PUBLISHED documentado oficialmente pela Meta como sinal
      // de que o container já foi publicado (developers.facebook.com/docs/
      // instagram-platform/content-publishing — "if media_publish does not
      // return the published media ID, query the container's status_code").
      // Não existe forma documentada/garantida de recuperar o ig_media_id
      // exato a partir do container nesse ponto — por isso NUNCA chamamos
      // media_publish de novo aqui (não há garantia de que seja seguro
      // reprocessar), preferindo fechar sem media_id/permalink certos
      // (sinalizado para reconciliação manual) a arriscar um segundo post
      // real no Instagram.
      console.warn('instagram-publish-worker: container já publicado numa tentativa anterior — resposta perdida, não republica.', {
        publicationId: row.id,
        containerId: finalContainerId,
      })
      await admin.rpc('complete_instagram_publication', { p_publication_id: row.id, p_ig_media_id: null, p_permalink: null })
      await admin.rpc('log_instagram_worker_audit_event', {
        p_workspace_id: content.workspace_id,
        p_action: 'instagram_publish_reconciliation_needed',
        p_resource_type: 'instagram_publications',
        p_resource_id: row.id,
        p_metadata: { container_id: finalContainerId, reason: 'container_already_published_response_lost' },
      }).catch(() => {})
      return 'published_unconfirmed_id'
    }

    await admin.from('instagram_publications').update({ status: 'publishing' }).eq('id', row.id)
    const { igMediaId } = await publishMediaContainer({ igUserId: account.ig_user_id, accessToken, creationId: finalContainerId! })
    const permalink = await fetchMediaPermalink({ igMediaId, accessToken }).catch(() => null)

    await admin.rpc('complete_instagram_publication', { p_publication_id: row.id, p_ig_media_id: igMediaId, p_permalink: permalink })
    return 'published'
  } catch (err) {
    const recoverable = isRecoverable(err)
    const message = err instanceof Error ? err.message : 'Erro inesperado ao publicar.'
    const code = err instanceof InstagramApiError ? String(err.status ?? 'meta_error') : 'network_error'
    return await scheduleRetry(admin, row, code, message, !recoverable)
  }
}

// deno-lint-ignore no-explicit-any
async function scheduleRetry(admin: any, row: PublicationRow, errorCode: string, errorMessage: string, forceTerminal: boolean): Promise<string>
// deno-lint-ignore no-explicit-any
async function scheduleRetry(admin: any, row: PublicationRow, errorCode: string, errorMessage: string, forceTerminal: boolean, explicitRetryAt: Date): Promise<string>
// deno-lint-ignore no-explicit-any
async function scheduleRetry(admin: any, row: PublicationRow, errorCode: string, errorMessage: string, forceTerminal: boolean, explicitRetryAt?: Date): Promise<string> {
  if (forceTerminal) {
    await admin.rpc('fail_instagram_publication', {
      p_publication_id: row.id,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_terminal: true,
    })
    return 'failed'
  }
  const { terminal, nextRetryAt: computedRetryAt } = nextRetryAt(row.attempt_count)
  const finalTerminal = terminal
  const retryAt = explicitRetryAt ?? computedRetryAt
  await admin.rpc('fail_instagram_publication', {
    p_publication_id: row.id,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_terminal: finalTerminal,
    p_next_retry_at: finalTerminal ? null : retryAt?.toISOString() ?? null,
  })
  return finalTerminal ? 'failed' : 'retry_scheduled'
}

// deno-lint-ignore no-explicit-any
async function getSignedAssetUrl(admin: any, path: string): Promise<string> {
  const { data, error } = await admin.storage.from('content-assets').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw new Error(`Falha ao gerar URL temporária para o asset: ${error?.message ?? 'desconhecido'}`)
  return data.signedUrl
}

async function checkRateLimit(igUserId: string, accessToken: string): Promise<string | null> {
  const limit = await fetchContentPublishingLimit({ igUserId, accessToken }).catch(() => null)
  if (!limit) return null
  if (limit.quotaUsage >= limit.config.quotaTotal) {
    return `Limite de publicações da Meta atingido (${limit.quotaUsage}/${limit.config.quotaTotal} em ${limit.config.quotaDuration}s).`
  }
  return null
}
