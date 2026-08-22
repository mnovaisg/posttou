// Espelho server-side de src/features/brand-dna/brandContext.ts.
// Edge Functions rodam em Deno e são deployadas como um conjunto de
// arquivos isolado (supabase deploy_edge_function não importa o resto do
// repo), então não há como reimportar o módulo do frontend diretamente —
// mantemos a mesma lógica de serialização aqui para não divergir do que o
// usuário configurou no DNA da marca.
// deno-lint-ignore-file no-explicit-any

export function brandProfileToPromptText(profile: Record<string, any> | null): string {
  if (!profile || !profile.company_name || !profile.description || !profile.onboarding_completed_at) {
    return 'DNA da marca ainda não configurado.'
  }

  const audience = profile.audience ?? {}
  const contentStrategy = profile.content_strategy ?? {}
  const voice = profile.voice ?? {}
  const vocabulary = profile.vocabulary ?? {}

  const lines: string[] = []
  lines.push(`Marca: ${profile.company_name} (${profile.segment || 'segmento não informado'})`)
  lines.push(`Descrição: ${profile.description}`)
  if (profile.differentiators) lines.push(`Diferenciais: ${profile.differentiators}`)
  if (profile.problems_solved) lines.push(`Problemas que resolve: ${profile.problems_solved}`)

  const interests: string[] = audience.interests ?? []
  const pains: string[] = audience.pains ?? []
  const desires: string[] = audience.desires ?? []
  if (interests.length || pains.length) {
    lines.push(`Público: interesses [${interests.join(', ')}], dores [${pains.join(', ')}], desejos [${desires.join(', ')}]`)
  }

  const priorityThemes: string[] = contentStrategy.priority_themes ?? []
  const topicsToAvoid: string[] = contentStrategy.topics_to_avoid ?? []
  if (priorityThemes.length) lines.push(`Temas prioritários: ${priorityThemes.join(', ')}`)
  if (topicsToAvoid.length) lines.push(`Nunca abordar: ${topicsToAvoid.join(', ')}`)

  lines.push(
    `Tom de voz: formalidade ${voice.formality ?? 50}/100, humor ${voice.tone ?? 50}/100, complexidade ${voice.complexity ?? 50}/100, pessoal x institucional ${voice.personal_institutional ?? 50}/100`,
  )
  const traits: string[] = voice.personality_traits ?? []
  if (traits.length) lines.push(`Personalidade: ${traits.join(', ')}`)

  const preferredWords: string[] = vocabulary.preferred_words ?? []
  const forbiddenWords: string[] = vocabulary.forbidden_words ?? []
  if (preferredWords.length) lines.push(`Usar palavras: ${preferredWords.join(', ')}`)
  if (forbiddenWords.length) lines.push(`Nunca usar palavras: ${forbiddenWords.join(', ')}`)
  if (vocabulary.preferred_cta) lines.push(`CTA preferido: ${vocabulary.preferred_cta}`)
  lines.push(`Emojis: ${vocabulary.emoji_usage ?? 'moderado'} | Hashtags: ${vocabulary.hashtag_usage ?? 'moderado'} (${vocabulary.hashtag_style || 'estilo livre'})`)

  return lines.join('\n')
}

export function isBrandProfileReady(profile: Record<string, any> | null): boolean {
  return !!profile?.company_name && !!profile?.description && !!profile?.onboarding_completed_at
}
