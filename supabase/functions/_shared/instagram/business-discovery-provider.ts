// Business Discovery — Instagram API with Facebook Login. Único lugar
// que fala com graph.facebook.com para consultar dados PÚBLICOS de
// contas Instagram Profissionais por @handle, sem exigir que o alvo
// conecte a própria conta. Autenticado pela conta profissional do
// próprio POSTTOU (segundo Meta App, "POSTTOU-DISCOVERY"), nunca pelo
// visitante. Só API oficial — nenhum scraping.
export class BusinessDiscoveryError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'BusinessDiscoveryError'
    this.code = code
  }
}

const GRAPH_BASE_URL = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v25.0'
const MEDIA_LIMIT = 25

export type FieldAvailability = 'available' | 'unavailable'

export interface BusinessDiscoveryMediaItem {
  id: string
  caption?: string
  mediaType?: string
  timestamp?: string
  permalink?: string
  likeCount?: number
  commentsCount?: number
}

export interface BusinessDiscoveryResult {
  igUserId: string
  username: string
  name?: string
  biography?: string
  website?: string
  profilePictureUrl?: string
  followersCount?: number
  followsCount?: number
  mediaCount?: number
  media: BusinessDiscoveryMediaItem[]
  fieldsAvailability: Record<string, FieldAvailability>
}

export async function fetchBusinessDiscovery(params: {
  callerIgUserId: string
  callerAccessToken: string
  targetHandle: string
}): Promise<BusinessDiscoveryResult> {
  const fields =
    `business_discovery.username(${params.targetHandle}){` +
    `username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,` +
    `media.limit(${MEDIA_LIMIT}){caption,media_type,timestamp,permalink,like_count,comments_count}}`

  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(params.callerIgUserId)}`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', params.callerAccessToken)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(url, { method: 'GET', signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BusinessDiscoveryError('timeout', 'Tempo limite excedido ao consultar o Business Discovery.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json().catch(() => null)

  if (!res.ok || !data || data.error) {
    const metaCode = data?.error?.code
    // Erros documentados mais comuns: alvo não é conta profissional,
    // alvo não existe, ou conta age-gated (dados não retornados).
    if (metaCode === 100 || metaCode === 803) {
      throw new BusinessDiscoveryError('profile_not_found', 'Perfil não encontrado ou não é uma conta profissional (Business/Creator).')
    }
    throw new BusinessDiscoveryError('provider_error', data?.error?.message ?? `Business Discovery retornou erro ${res.status}.`)
  }

  const bd = data.business_discovery
  if (!bd || !bd.username) {
    throw new BusinessDiscoveryError('profile_not_found', 'Perfil não encontrado ou não é uma conta profissional (Business/Creator).')
  }

  const mediaItemsRaw: Record<string, unknown>[] = bd.media?.data ?? []
  const captionAvailable = mediaItemsRaw.some((m) => typeof m.caption === 'string')

  const fieldsAvailability: Record<string, FieldAvailability> = {
    biography: typeof bd.biography === 'string' ? 'available' : 'unavailable',
    website: typeof bd.website === 'string' ? 'available' : 'unavailable',
    caption: captionAvailable ? 'available' : 'unavailable',
  }

  return {
    igUserId: String(data.id),
    username: bd.username,
    name: bd.name,
    biography: bd.biography,
    website: bd.website,
    profilePictureUrl: bd.profile_picture_url,
    followersCount: bd.followers_count,
    followsCount: bd.follows_count,
    mediaCount: bd.media_count,
    media: mediaItemsRaw.map((m) => ({
      id: String(m.id),
      caption: typeof m.caption === 'string' ? m.caption : undefined,
      mediaType: m.media_type as string | undefined,
      timestamp: m.timestamp as string | undefined,
      permalink: m.permalink as string | undefined,
      likeCount: m.like_count as number | undefined,
      commentsCount: m.comments_count as number | undefined,
    })),
    fieldsAvailability,
  }
}

export interface DerivedData {
  totalAnalyzed: number
  formatDistribution: Record<string, number>
  avgPostsPerWeek: number | null
  avgLikeCount: number | null
  avgCommentsCount: number | null
}

/** Dados B (derivados) — calculados deterministicamente, nunca pela IA. */
export function computeDerivedData(media: BusinessDiscoveryMediaItem[]): DerivedData {
  const total = media.length
  const formatCounts: Record<string, number> = {}
  let likeSum = 0
  let likeCount = 0
  let commentSum = 0
  let commentCount = 0
  const timestamps: number[] = []

  for (const item of media) {
    const type = item.mediaType ?? 'UNKNOWN'
    formatCounts[type] = (formatCounts[type] ?? 0) + 1
    if (typeof item.likeCount === 'number') {
      likeSum += item.likeCount
      likeCount++
    }
    if (typeof item.commentsCount === 'number') {
      commentSum += item.commentsCount
      commentCount++
    }
    if (item.timestamp) {
      const t = Date.parse(item.timestamp)
      if (!Number.isNaN(t)) timestamps.push(t)
    }
  }

  const formatDistribution: Record<string, number> = {}
  for (const [type, count] of Object.entries(formatCounts)) {
    formatDistribution[type] = total > 0 ? Math.round((count / total) * 1000) / 10 : 0
  }

  let avgPostsPerWeek: number | null = null
  if (timestamps.length >= 2) {
    timestamps.sort((a, b) => a - b)
    const spanMs = timestamps[timestamps.length - 1] - timestamps[0]
    const spanWeeks = spanMs / (1000 * 60 * 60 * 24 * 7)
    if (spanWeeks > 0) avgPostsPerWeek = Math.round((timestamps.length / spanWeeks) * 10) / 10
  }

  return {
    totalAnalyzed: total,
    formatDistribution,
    avgPostsPerWeek,
    avgLikeCount: likeCount > 0 ? Math.round(likeSum / likeCount) : null,
    avgCommentsCount: commentCount > 0 ? Math.round(commentSum / commentCount) : null,
  }
}
