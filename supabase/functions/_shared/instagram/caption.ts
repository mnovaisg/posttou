// Legenda final enviada à Meta — reaproveitada tanto pelo preview
// (antes de publicar/agendar) quanto pelo worker de publicação, para
// que o texto mostrado ao usuário seja EXATAMENTE o que será publicado
// (item 20 da Fase 7: nunca alterar a legenda silenciosamente no
// momento da publicação).
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
