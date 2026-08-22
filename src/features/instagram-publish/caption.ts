// Espelha supabase/functions/_shared/instagram/caption.ts — mesmo
// formato usado no preview (frontend) e na publicação real (worker),
// para que o texto mostrado nunca divirja do que é enviado à Meta.
export function composeInstagramCaption(params: {
  caption?: string | null
  cta?: string | null
  hashtags?: string[] | null
}): string {
  const parts: string[] = []
  if (params.caption?.trim()) parts.push(params.caption.trim())
  if (params.cta?.trim()) parts.push(params.cta.trim())
  const hashtags = (params.hashtags ?? []).filter((h) => h && h.trim().length > 0)
  if (hashtags.length) {
    parts.push(hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '))
  }
  return parts.join('\n\n')
}
