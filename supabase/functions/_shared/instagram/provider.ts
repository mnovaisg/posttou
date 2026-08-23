// Abstração da integração oficial com o Instagram (Business Login for
// Instagram / "Instagram API with Instagram Login"). Único lugar do
// POSTTOU que fala com a Meta — nenhuma Edge Function de feature deve
// montar essas URLs por conta própria. Só API oficial, documentada em
// developers.facebook.com/docs/instagram-platform — sem scraping, sem
// endpoint não documentado.
export class InstagramApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'InstagramApiError'
    this.status = status
  }
}

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
const TOKEN_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token'
const GRAPH_BASE_URL = 'https://graph.instagram.com'
const GRAPH_VERSION = 'v25.0'

// Fase 6: instagram_business_basic (perfil + mídia própria).
// Fase 7: + instagram_business_content_publish (publicar posts/carrosséis).
// Fase 10: + instagram_business_manage_insights (ler métricas reais de
// posts publicados) — confirmado como o nome exato do scope direto em
// developers.facebook.com/docs/instagram-platform/insights/ no momento da
// implementação (Instagram API with Instagram Login; a variante
// instagram_manage_insights é só do fluxo com Facebook Login, que o
// POSTTOU não usa). Requer Advanced Access + App Review para contas de
// terceiros — funciona com Standard Access só em contas próprias/testers
// do app (ex.: @posttou.app) enquanto o review não é aprovado.
// Contas conectadas antes deste scope não têm a permissão — precisam
// reconectar explicitamente (nunca assumimos que um token antigo já a tem;
// ver instagram_accounts.insights_status).
export const INSTAGRAM_OAUTH_SCOPE = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights'

export function buildAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', INSTAGRAM_OAUTH_SCOPE)
  url.searchParams.set('state', params.state)
  return url.toString()
}

/** A Meta anexa "#_" ao final do code no redirect — não faz parte do code em si. */
export function stripCodeSuffix(code: string): string {
  return code.endsWith('#_') ? code.slice(0, -2) : code
}

export interface ShortLivedTokenResult {
  accessToken: string
  userId: string
  permissions: string
}

export async function exchangeCodeForShortLivedToken(params: {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}): Promise<ShortLivedTokenResult> {
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code: stripCodeSuffix(params.code),
  })

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await res.json().catch(() => null)
  // A Meta pode responder 200 com um corpo de erro (error_type/error_message,
  // ou error/error_description no formato OAuth) — nunca confiar só no
  // status HTTP para decidir se deu certo.
  if (!res.ok || !data || data.error || data.error_type) {
    const detail = data?.error_message || data?.error_description || data?.error?.message || JSON.stringify(data).slice(0, 500)
    throw new InstagramApiError(`Falha ao trocar o código por token: ${detail}`, res.status)
  }

  // A resposta pode vir tanto no formato flat ({access_token, user_id, ...})
  // quanto envelopada em {data: [{...}]}, dependendo da variante do
  // endpoint — aceitamos as duas em vez de assumir uma só.
  const entry = data.access_token ? data : data?.data?.[0]
  if (!entry?.access_token || !entry?.user_id) {
    throw new InstagramApiError(`Resposta inesperada da Meta ao trocar o código por token: ${JSON.stringify(data).slice(0, 500)}`, 502)
  }

  return { accessToken: entry.access_token, userId: String(entry.user_id), permissions: entry.permissions ?? '' }
}

export interface LongLivedTokenResult {
  accessToken: string
  expiresInSeconds: number
}

export async function exchangeForLongLivedToken(params: {
  appSecret: string
  shortLivedToken: string
}): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_BASE_URL}/access_token`)
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('access_token', params.shortLivedToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao obter token de longa duração: ${detail}`, res.status)
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60 }
}

export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_BASE_URL}/refresh_access_token`)
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', currentToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao renovar token: ${detail}`, res.status)
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60 }
}

export interface InstagramProfile {
  id: string
  username: string
  name?: string
  biography?: string
  profilePictureUrl?: string
  followersCount?: number
  followsCount?: number
  mediaCount?: number
  website?: string
}

export async function fetchProfile(params: { igUserId: string; accessToken: string }): Promise<InstagramProfile> {
  // Documentação oficial (Instagram API with Instagram Login — Get
  // Started): o perfil do próprio usuário autenticado é buscado via
  // graph.instagram.com/{version}/me — o access_token já identifica de
  // quem é o perfil, não se usa o user_id retornado na troca de token
  // como parâmetro de path (isso retorna "does not exist / missing
  // permissions" mesmo com token válido).
  const fields = ['user_id', 'username', 'name', 'biography', 'profile_picture_url', 'followers_count', 'follows_count', 'media_count', 'website'].join(',')
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/me`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', params.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok || (!data?.user_id && !data?.id)) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao buscar perfil do Instagram: ${detail}`, res.status)
  }

  return {
    id: String(data.user_id ?? data.id ?? params.igUserId),
    username: data.username,
    name: data.name,
    biography: data.biography,
    profilePictureUrl: data.profile_picture_url,
    followersCount: data.followers_count,
    followsCount: data.follows_count,
    mediaCount: data.media_count,
    website: data.website,
  }
}

// ── Publicação (Fase 7) ──────────────────────────────────────────────
// Fluxo oficial (developers.facebook.com/docs/instagram-platform/content-publishing):
//   criar container (imagem, ou filho de carrossel) -> poll status_code
//   até FINISHED -> media_publish(creation_id) -> ig_media_id.
// Carrossel: 1 container filho por imagem (is_carousel_item=true) ->
//   container pai (media_type=CAROUSEL, children=[...ids]) -> media_publish.
// image_url precisa ser publicamente acessível NO MOMENTO da chamada —
// por isso o worker gera a signed URL só agora, nunca antes.

export type ContainerStatusCode = 'IN_PROGRESS' | 'FINISHED' | 'PUBLISHED' | 'ERROR' | 'EXPIRED'

export async function createImageContainer(params: {
  igUserId: string
  accessToken: string
  imageUrl: string
  caption?: string
  isCarouselItem?: boolean
}): Promise<{ containerId: string }> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/media`)
  const body = new URLSearchParams({
    access_token: params.accessToken,
    image_url: params.imageUrl,
  })
  if (params.caption) body.set('caption', params.caption)
  if (params.isCarouselItem) body.set('is_carousel_item', 'true')

  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.id) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao criar container de mídia: ${detail}`, res.status)
  }
  return { containerId: String(data.id) }
}

export async function createCarouselContainer(params: {
  igUserId: string
  accessToken: string
  childContainerIds: string[]
  caption?: string
}): Promise<{ containerId: string }> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/media`)
  const body = new URLSearchParams({
    access_token: params.accessToken,
    media_type: 'CAROUSEL',
    children: params.childContainerIds.join(','),
  })
  if (params.caption) body.set('caption', params.caption)

  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.id) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao criar container de carrossel: ${detail}`, res.status)
  }
  return { containerId: String(data.id) }
}

export async function getContainerStatus(params: {
  containerId: string
  accessToken: string
}): Promise<{ statusCode: ContainerStatusCode; statusText?: string }> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.containerId)}`)
  url.searchParams.set('fields', 'status_code,status')
  url.searchParams.set('access_token', params.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status_code) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    throw new InstagramApiError(`Falha ao consultar status do container: ${detail}`, res.status)
  }
  return { statusCode: data.status_code as ContainerStatusCode, statusText: data.status }
}

export async function publishMediaContainer(params: {
  igUserId: string
  accessToken: string
  creationId: string
}): Promise<{ igMediaId: string }> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/media_publish`)
  const body = new URLSearchParams({
    access_token: params.accessToken,
    creation_id: params.creationId,
  })

  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.id) {
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    const metaCode = data?.error?.code
    throw new InstagramApiError(`Falha ao publicar mídia: ${detail}`, res.status ?? metaCode)
  }
  return { igMediaId: String(data.id) }
}

export async function fetchMediaPermalink(params: { igMediaId: string; accessToken: string }): Promise<string | null> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igMediaId)}`)
  url.searchParams.set('fields', 'permalink')
  url.searchParams.set('access_token', params.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok) return null
  return data?.permalink ?? null
}

// ── Insights (Fase 10) ───────────────────────────────────────────────
// developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
// GET /<ig-media-id>/insights?metric=reach,likes,comments,saved,shares,views,total_interactions
// impressions foi depreciada para mídia em 02/jul/2024 — nunca usada aqui.
// views/total_interactions estão marcadas "em desenvolvimento" pela Meta —
// tratamos ausência como métrica não suportada, nunca como zero.
export const MEDIA_INSIGHTS_METRICS = ['reach', 'likes', 'comments', 'saved', 'shares', 'views', 'total_interactions'] as const
export type MediaInsightsMetric = (typeof MEDIA_INSIGHTS_METRICS)[number]

export interface MediaInsightsResult {
  values: Partial<Record<MediaInsightsMetric, number>>
  unsupportedMetrics: MediaInsightsMetric[]
  raw: unknown
}

/** Erro de permissão da Meta (token sem o escopo de insights) — nunca tratado como falha genérica. */
export class InstagramPermissionError extends InstagramApiError {}
/** Mídia apagada/indisponível na Meta — terminal, nunca retry. */
export class InstagramMediaUnavailableError extends InstagramApiError {}

const PERMISSION_ERROR_CODES = new Set([10, 200, 190, 294])

export async function fetchMediaInsights(params: { igMediaId: string; accessToken: string }): Promise<MediaInsightsResult> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igMediaId)}/insights`)
  url.searchParams.set('metric', MEDIA_INSIGHTS_METRICS.join(','))
  url.searchParams.set('access_token', params.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const errorCode = data?.error?.code
    const errorSubcode = data?.error?.error_subcode
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300)
    // Erro 10/190/200/294: permissão ausente/token sem escopo — nunca confundir com "métrica indisponível".
    if (typeof errorCode === 'number' && PERMISSION_ERROR_CODES.has(errorCode)) {
      throw new InstagramPermissionError(`Permissão de insights ausente: ${detail}`, res.status)
    }
    // Mídia inexistente/apagada.
    if (errorCode === 100 && (errorSubcode === 33 || /does not exist|cannot be loaded/i.test(String(detail)))) {
      throw new InstagramMediaUnavailableError(`Mídia indisponível: ${detail}`, res.status)
    }
    throw new InstagramApiError(`Falha ao buscar insights da mídia: ${detail}`, res.status)
  }

  const values: Partial<Record<MediaInsightsMetric, number>> = {}
  const returned = new Set<string>()
  for (const entry of (data?.data ?? []) as Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>) {
    const metric = entry.name as MediaInsightsMetric
    returned.add(metric)
    const value = entry.total_value?.value ?? entry.values?.[0]?.value
    if (typeof value === 'number') values[metric] = value
  }
  const unsupportedMetrics = MEDIA_INSIGHTS_METRICS.filter((m) => !returned.has(m))

  return { values, unsupportedMetrics, raw: data }
}

export interface ContentPublishingLimit {
  quotaUsage: number
  config: { quotaTotal: number; quotaDuration: number }
}

/** Consulta o rate limit oficial (100 posts/24h) antes de tentar publicar. */
export async function fetchContentPublishingLimit(params: {
  igUserId: string
  accessToken: string
}): Promise<ContentPublishingLimit | null> {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}/content_publishing_limit`)
  url.searchParams.set('fields', 'quota_usage,config')
  url.searchParams.set('access_token', params.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.data?.[0]) return null
  const entry = data.data[0]
  return {
    quotaUsage: entry.quota_usage,
    config: { quotaTotal: entry.config?.quota_total, quotaDuration: entry.config?.quota_duration },
  }
}
