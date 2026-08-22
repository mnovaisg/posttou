// Fase 8 — Radar Viral: única fonte externa aprovada no MVP (item 9 da
// aprovação). Usa videos.list(chart=mostPopular) em vez de search.list —
// custa 1 unidade de quota por chamada (vs. 100 do search), suficiente
// para "o que está em alta" sem depender de keyword. API oficial, sem
// scraping, sem automação de browser.
import type { NormalizedSignal } from './types.ts'

export class YoutubeApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'YoutubeApiError'
    this.status = status
  }
}

export interface YoutubeFetchResult {
  signals: NormalizedSignal[]
  quotaUnitsUsed: number
}

// deno-lint-ignore no-explicit-any
function metric(stats: any, key: string) {
  const raw = stats?.[key]
  return raw === undefined ? { value: null, available: false } : { value: Number(raw), available: true }
}

export async function fetchYoutubeTrending(
  apiKey: string,
  regionCode = 'BR',
  maxResults = 50,
): Promise<YoutubeFetchResult> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('regionCode', regionCode)
  url.searchParams.set('maxResults', String(Math.min(maxResults, 50)))
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new YoutubeApiError(body?.error?.message ?? `YouTube API respondeu ${res.status}.`, res.status)
  }

  // deno-lint-ignore no-explicit-any
  const signals: NormalizedSignal[] = (body.items ?? []).map((item: any) => {
    const stats = item.statistics ?? {}
    const snippet = item.snippet ?? {}
    return {
      provider: 'youtube',
      externalId: item.id as string,
      signalType: 'video',
      title: snippet.title ?? null,
      textContent: snippet.description ? String(snippet.description).slice(0, 1000) : null,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      authorName: snippet.channelTitle ?? null,
      authorHandle: null,
      publishedAt: snippet.publishedAt ?? null,
      metrics: {
        views: metric(stats, 'viewCount'),
        likes: metric(stats, 'likeCount'),
        comments: metric(stats, 'commentCount'),
      },
      rawMetadata: { categoryId: snippet.categoryId ?? null, tags: snippet.tags ?? [], regionCode },
    }
  })

  // 1 chamada = 1 unidade de quota (chart=mostPopular), bem abaixo das
  // 10.000/dia grátis mesmo rodando várias vezes ao dia.
  return { signals, quotaUnitsUsed: 1 }
}
