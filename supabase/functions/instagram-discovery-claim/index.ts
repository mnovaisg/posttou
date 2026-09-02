// Edge Function: reivindica (claim) uma sessão de Discovery anônima
// depois do cadastro/login, vinculando-a a um workspace real. Requer
// JWT — chamada logo após o usuário criar conta ou logar. Claim é
// atômico e single-use: UPDATE condicional (status='ready' AND
// claimed_at IS NULL AND expires_at > now()) — só passa uma vez, mesmo
// padrão já validado em instagram_oauth_states. Também promove, de
// forma idempotente, as 3 sugestões de conteúdo exatamente como o
// visitante as viu antes do cadastro (nunca gera novas ideias por IA).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sha256Hex } from '../_shared/instagram/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------------
// Réplica exata (Deno não importa src/ do frontend) de
// src/features/content/types.ts — mantenha em sincronia se aqueles
// valores mudarem.
type ContentType = 'post' | 'carrossel' | 'reel'
type ContentFormat = '1:1' | '4:5' | '9:16'

const DEFAULT_FORMAT_BY_TYPE: Record<ContentType, ContentFormat> = {
  post: '4:5',
  carrossel: '4:5',
  reel: '9:16',
}

const PAGE_DIMENSIONS_BY_FORMAT: Record<ContentFormat, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
}

// ---------------------------------------------------------------------
// Réplica exata (mesma razão) da lógica de bucketing por objetivo de
// src/features/instagram-discovery/ContentPreviewCards.tsx — garante
// que os conteúdos promovidos no claim sejam EXATAMENTE os 3 previews
// que o visitante viu antes do cadastro, não um novo lote.
interface DiscoveryIdea {
  titulo: string
  gancho: string
  formato: ContentType
  pilar: string
  objetivo: string
  resumo: string
}

interface DnaReviewStateLike {
  name?: string
  description?: string
  themes?: string[]
  objectives?: string[]
  tone?: string
}

type PreviewObjective = 'descoberta' | 'autoridade' | 'conversao'

interface ContentPreview {
  objective: PreviewObjective
  title: string
  support: string
  format: ContentType
  sourceIdeaIndex: number | null
}

// Réplica exata (Deno não importa src/ do frontend) da correção em
// src/features/instagram-discovery/ContentPreviewCards.tsx — palavras
// inteiras normalizadas, não substring regex (que disparava falso
// positivo em "educação" → "conversão"). Qualquer mudança aqui precisa
// ser espelhada lá.
const CONVERSAO_WORDS = new Set([
  'venda', 'vendas', 'vender', 'conversao', 'lead', 'leads', 'cta', 'agendar', 'agendamento', 'comprar', 'compra',
])
const AUTORIDADE_WORDS = new Set([
  'autoridade', 'educacao', 'educar', 'educativo', 'conhecimento', 'ensinar', 'ensino', 'relacionamento',
])
const DESCOBERTA_WORDS = new Set(['alcance', 'descoberta', 'descobrir', 'engajamento', 'viral'])

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function matchIdeaObjective(idea: DiscoveryIdea): PreviewObjective | null {
  const words = normalizeWords(`${idea.objetivo ?? ''} ${idea.pilar ?? ''}`)
  if (words.some((w) => CONVERSAO_WORDS.has(w))) return 'conversao'
  if (words.some((w) => AUTORIDADE_WORDS.has(w))) return 'autoridade'
  if (words.some((w) => DESCOBERTA_WORDS.has(w))) return 'descoberta'
  return null
}

function firstNonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }
  return ''
}

function fallbackPreview(objective: PreviewObjective, dna: DnaReviewStateLike, format: ContentType): ContentPreview {
  const name = firstNonEmpty(dna.name, 'sua marca')
  const theme = dna.themes?.[0]
  const objectiveText = dna.objectives?.[0]

  const titleByObjective: Record<PreviewObjective, string> = {
    descoberta: theme ? `Conheça a ${name}: ${theme}` : `Conheça a ${name}`,
    autoridade: theme ? `O que guia a ${name} em ${theme}` : `Por dentro da ${name}`,
    conversao: objectiveText ? `Pronto para ${objectiveText.toLowerCase()}?` : `Fale com a ${name}`,
  }

  const supportByObjective: Record<PreviewObjective, string> = {
    descoberta: dna.description || 'Uma primeira apresentação para quem ainda não te conhece.',
    autoridade: dna.tone ? `Tom ${dna.tone.toLowerCase()}, direto ao ponto.` : 'Mostrando como sua marca pensa.',
    conversao: 'Um convite claro para dar o próximo passo.',
  }

  return {
    objective,
    title: titleByObjective[objective],
    support: supportByObjective[objective],
    format,
    sourceIdeaIndex: null,
  }
}

function buildContentPreviews(ideas: DiscoveryIdea[], dna: DnaReviewStateLike): ContentPreview[] {
  const order: PreviewObjective[] = ['descoberta', 'autoridade', 'conversao']
  const fallbackFormats: ContentType[] = ['post', 'carrossel', 'reel']
  const usedIdeaIndexes = new Set<number>()

  return order.map((objective, i) => {
    const matchIndex = ideas.findIndex((idea, idx) => !usedIdeaIndexes.has(idx) && matchIdeaObjective(idea) === objective)
    if (matchIndex !== -1) {
      usedIdeaIndexes.add(matchIndex)
      const idea = ideas[matchIndex]
      return {
        objective,
        title: firstNonEmpty(idea.titulo, idea.gancho),
        support: firstNonEmpty(idea.gancho !== idea.titulo ? idea.gancho : '', idea.resumo),
        format: idea.formato,
        sourceIdeaIndex: matchIndex,
      }
    }
    return fallbackPreview(objective, dna, fallbackFormats[i])
  })
}

// ---------------------------------------------------------------------

/**
 * Promove, de forma idempotente, as 3 sugestões pré-cadastro em
 * `contents` (+ 1 `content_pages` cada, sem imagem solicitada). Se já
 * existir qualquer conteúdo vinculado a esta sessão, não promove de
 * novo — proteção no banco, não só no React.
 */
async function promoteContents(
  admin: ReturnType<typeof createClient>,
  params: {
    sessionId: string
    workspaceId: string
    userId: string
    handle: string
    ideias: DiscoveryIdea[] | null
    dnaForPreviews: DnaReviewStateLike
  },
) {
  const { data: already } = await admin
    .from('contents')
    .select('id')
    .eq('discovery_session_id', params.sessionId)
    .limit(1)
  if (already && already.length > 0) return

  const previews = buildContentPreviews(params.ideias ?? [], params.dnaForPreviews)

  for (const preview of previews) {
    const format = DEFAULT_FORMAT_BY_TYPE[preview.format]
    const dims = PAGE_DIMENSIONS_BY_FORMAT[format]

    // RPC dedicada (não .from('contents').insert direto): o trigger de
    // auditoria de INSERT em contents chama log_audit_event, que exige
    // o marcador posttou.system_actor='discovery_claim_worker' NA MESMA
    // transação do INSERT — set_config de uma chamada REST anterior não
    // persiste (mesmo padrão já usado por pilot_create_content).
    const { error: rpcError } = await admin.rpc('discovery_claim_create_content', {
      p_workspace_id: params.workspaceId,
      p_type: preview.format,
      p_format: format,
      p_title: preview.title || 'Sugestão do POSTTOU',
      p_caption: preview.support || null,
      p_created_by: params.userId,
      p_discovery_session_id: params.sessionId,
      p_page_width: dims.width,
      p_page_height: dims.height,
    })

    if (rpcError) {
      console.error('instagram-discovery-claim: falha ao promover sugestão.', rpcError)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
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
    const token = (body as Record<string, unknown> | null)?.token
    const workspaceId = (body as Record<string, unknown> | null)?.workspaceId
    if (typeof token !== 'string' || !token) return json({ error: 'token é obrigatório.' }, 400)
    if (typeof workspaceId !== 'string' || !workspaceId) return json({ error: 'workspaceId é obrigatório.' }, 400)

    const { data: isMember, error: memberError } = await userClient.rpc('is_workspace_member', { p_workspace_id: workspaceId })
    if (memberError || !isMember) return json({ error: 'Sem acesso a este workspace.' }, 403)

    const tokenHash = await sha256Hex(token)

    const { data: claimed, error: claimError } = await admin
      .from('pre_onboarding_sessions')
      .update({
        status: 'claimed',
        claimed_by_user_id: userData.user.id,
        claimed_workspace_id: workspaceId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('token_hash', tokenHash)
      .eq('status', 'ready')
      .is('claimed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id, handle, dna_preliminar, dna_revisado, ideias_preliminares')
      .maybeSingle()

    if (claimError) {
      console.error('instagram-discovery-claim: erro ao reivindicar.', claimError)
      return json({ error: 'internal_error' }, 500)
    }

    let session = claimed

    // Tolerância a retry: se o UPDATE condicional não encontrou linha
    // 'ready', pode ser porque ESTE MESMO usuário já reivindicou esta
    // sessão antes (refresh, duas abas, retry de rede) — nesse caso
    // trata como sucesso idempotente em vez de 410, sem nunca permitir
    // que outro usuário reivindique uma sessão já reivindicada.
    if (!session) {
      const { data: existing } = await admin
        .from('pre_onboarding_sessions')
        .select('id, handle, dna_preliminar, dna_revisado, ideias_preliminares, claimed_by_user_id, claimed_workspace_id')
        .eq('token_hash', tokenHash)
        .maybeSingle()

      const alreadyClaimedBySameUser =
        existing && existing.claimed_by_user_id === userData.user.id && existing.claimed_workspace_id === workspaceId

      if (!alreadyClaimedBySameUser) {
        return json({ error: 'invalid_session', message: 'Essa análise não existe mais, já foi usada, ou expirou.' }, 410)
      }
      session = existing
    }

    if (!session) {
      return json({ error: 'invalid_session', message: 'Essa análise não existe mais, já foi usada, ou expirou.' }, 410)
    }

    // DNA revisado tem prioridade sobre o preliminar (usuário editou
    // antes do cadastro); o preliminar original nunca é sobrescrito na
    // sessão, só usado aqui como respaldo quando não há revisão.
    const dnaRevisado = session.dna_revisado as DnaReviewStateLike | null
    const dnaForPreviews: DnaReviewStateLike = dnaRevisado ?? {
      name: undefined,
      description: (session.dna_preliminar as Record<string, unknown> | null)?.identidade
        ? ((session.dna_preliminar as any)?.identidade?.descricao?.value as string | undefined)
        : undefined,
      themes: (session.dna_preliminar as any)?.estrategia?.temas_recorrentes ?? [],
      objectives: (session.dna_preliminar as any)?.estrategia?.objetivos_provaveis ?? [],
      tone: (session.dna_preliminar as any)?.voz?.tom?.value,
    }

    await promoteContents(admin, {
      sessionId: session.id,
      workspaceId,
      userId: userData.user.id,
      handle: session.handle,
      ideias: session.ideias_preliminares as DiscoveryIdea[] | null,
      dnaForPreviews,
    })

    await userClient.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: 'instagram_discovery_claimed',
      p_resource_type: 'pre_onboarding_sessions',
      p_resource_id: session.id,
      p_metadata: { handle: session.handle },
    })

    return json({
      success: true,
      handle: session.handle,
      dna: session.dna_preliminar,
      dnaRevisado: session.dna_revisado ?? null,
      ideias: session.ideias_preliminares,
    })
  } catch (err) {
    console.error('instagram-discovery-claim: erro inesperado.', err)
    return json({ error: 'internal_error' }, 500)
  }
})
