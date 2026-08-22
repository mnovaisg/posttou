// Edge Function: Discovery pública (pré-cadastro). Endpoint público
// (verify_jwt=false) — é a etapa "@handle → já entendemos sua marca"
// antes do visitante criar conta. Autenticado do lado da Meta pela
// conta profissional do próprio POSTTOU (Business Discovery), nunca
// pelo visitante — ele não faz login nenhum aqui.
//
// Nunca usa scraping/API não oficial. Se INSTAGRAM_DISCOVERY_APP_ID/
// APP_SECRET/token do caller não estiverem configurados, retorna
// not_configured — nunca simula um resultado.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError, ProviderRequestError } from '../_shared/ai-gateway/gateway.ts'
import { buildDiscoveryPrompt } from '../_shared/ai-gateway/discovery-prompt.ts'
import { BusinessDiscoveryError, computeDerivedData, fetchBusinessDiscovery } from '../_shared/instagram/business-discovery-provider.ts'
import { hmacSha256Hex, sha256Hex } from '../_shared/instagram/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function normalizeHandle(raw: string): string | null {
  let h = raw.trim()
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  h = h.replace(/\/.*$/, '')
  h = h.replace(/^@/, '')
  h = h.trim().toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return null
  return h
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text)
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? 'unknown'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const body = await req.json().catch(() => null)
    const rawHandle = (body as Record<string, unknown> | null)?.handle
    if (typeof rawHandle !== 'string' || !rawHandle.trim()) return json({ error: 'handle é obrigatório.' }, 400)

    const handle = normalizeHandle(rawHandle)
    if (!handle) return json({ error: 'invalid_handle', message: '@ inválido. Use letras, números, ponto ou underscore.' }, 400)

    const appId = Deno.env.get('INSTAGRAM_DISCOVERY_APP_ID')
    const callerToken = Deno.env.get('INSTAGRAM_DISCOVERY_CALLER_ACCESS_TOKEN')
    const callerIgUserId = Deno.env.get('INSTAGRAM_DISCOVERY_CALLER_IG_USER_ID')
    const ipHashSecret = Deno.env.get('DISCOVERY_IP_HASH_SECRET')
    if (!appId || !callerToken || !callerIgUserId || !ipHashSecret) {
      return json(
        { error: 'not_configured', message: 'A descoberta automática pelo Instagram ainda não está configurada neste ambiente.' },
        501,
      )
    }

    const ip = getClientIp(req)
    const ipHash = await hmacSha256Hex(ip, ipHashSecret)

    const ipLimit = Number(Deno.env.get('DISCOVERY_RATE_LIMIT_PER_IP_HOUR') ?? '5')
    const handleLimit = Number(Deno.env.get('DISCOVERY_RATE_LIMIT_PER_HANDLE_DAY') ?? '20')

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { count: ipCount } = await admin
      .from('pre_onboarding_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gt('created_at', oneHourAgo)
    if ((ipCount ?? 0) >= ipLimit) {
      return json({ error: 'rate_limited', message: 'Muitas análises em pouco tempo. Tente novamente em instantes.' }, 429)
    }

    const { count: handleCount } = await admin
      .from('pre_onboarding_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('handle', handle)
      .gt('created_at', oneDayAgo)
    if ((handleCount ?? 0) >= handleLimit) {
      return json({ error: 'rate_limited', message: 'Esse perfil já foi analisado muitas vezes hoje. Tente novamente amanhã.' }, 429)
    }

    // ── Cache do snapshot (6h) ──────────────────────────────────────
    let snapshotId: string
    let usedCachedSnapshot = false
    let profile: Awaited<ReturnType<typeof fetchBusinessDiscovery>>

    const { data: cached } = await admin
      .from('instagram_handle_snapshots')
      .select('*')
      .eq('handle', handle)
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      usedCachedSnapshot = true
      snapshotId = cached.id
      profile = {
        igUserId: cached.ig_user_id,
        username: (cached.profile_snapshot as Record<string, unknown>).username as string,
        name: (cached.profile_snapshot as Record<string, unknown>).name as string | undefined,
        biography: (cached.profile_snapshot as Record<string, unknown>).biography as string | undefined,
        website: (cached.profile_snapshot as Record<string, unknown>).website as string | undefined,
        profilePictureUrl: (cached.profile_snapshot as Record<string, unknown>).profilePictureUrl as string | undefined,
        followersCount: (cached.profile_snapshot as Record<string, unknown>).followersCount as number | undefined,
        followsCount: (cached.profile_snapshot as Record<string, unknown>).followsCount as number | undefined,
        mediaCount: (cached.profile_snapshot as Record<string, unknown>).mediaCount as number | undefined,
        media: cached.media_snapshot as never,
        fieldsAvailability: cached.fields_availability as Record<string, 'available' | 'unavailable'>,
      }
    } else {
      try {
        profile = await fetchBusinessDiscovery({ callerIgUserId, callerAccessToken: callerToken, targetHandle: handle })
      } catch (err) {
        const code = err instanceof BusinessDiscoveryError ? err.code : 'provider_error'
        const message = err instanceof Error ? err.message : 'Erro inesperado ao consultar o Instagram.'
        const tokenOnFail = randomToken()
        const tokenHashOnFail = await sha256Hex(tokenOnFail)
        await admin.from('pre_onboarding_sessions').insert({
          token_hash: tokenHashOnFail,
          handle,
          status: 'failed',
          error_code: code,
          error_message: message,
          ip_hash: ipHash,
        })
        const friendly =
          code === 'profile_not_found'
            ? 'Não encontramos esse perfil, ou ele não é uma conta profissional (Business/Creator) do Instagram.'
            : 'Não conseguimos analisar esse perfil automaticamente agora.'
        return json({ error: code, message: friendly, token: tokenOnFail, status: 'failed' }, 200)
      }

      const { data: snapshot, error: snapshotError } = await admin
        .from('instagram_handle_snapshots')
        .insert({
          handle,
          ig_user_id: profile.igUserId,
          profile_snapshot: {
            username: profile.username,
            name: profile.name,
            biography: profile.biography,
            website: profile.website,
            profilePictureUrl: profile.profilePictureUrl,
            followersCount: profile.followersCount,
            followsCount: profile.followsCount,
            mediaCount: profile.mediaCount,
          },
          media_snapshot: profile.media,
          fields_availability: profile.fieldsAvailability,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        })
        .select('id')
        .single()
      if (snapshotError || !snapshot) {
        console.error('instagram-discovery-public-start: falha ao gravar snapshot.', snapshotError)
        return json({ error: 'internal_error', message: 'Erro inesperado ao processar a análise.' }, 500)
      }
      snapshotId = snapshot.id
    }

    // ── Cria a sessão (analyzing) ───────────────────────────────────
    const token = randomToken()
    const tokenHash = await sha256Hex(token)

    const { data: session, error: sessionError } = await admin
      .from('pre_onboarding_sessions')
      .insert({
        token_hash: tokenHash,
        handle,
        snapshot_id: snapshotId,
        used_cached_snapshot: usedCachedSnapshot,
        status: 'analyzing',
        ip_hash: ipHash,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      })
      .select('id')
      .single()
    if (sessionError || !session) {
      console.error('instagram-discovery-public-start: falha ao criar sessão.', sessionError)
      return json({ error: 'internal_error', message: 'Erro inesperado ao processar a análise.' }, 500)
    }

    // ── IA (AI Gateway — nunca chamado direto por feature nenhuma) ──
    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        await admin.from('pre_onboarding_sessions').update({ status: 'failed', error_code: 'ai_not_configured' }).eq('id', session.id)
        return json({ error: 'not_configured', token, status: 'failed' }, 501)
      }
      throw err
    }

    const derived = computeDerivedData(profile.media)
    const captions = profile.media.map((m) => m.caption).filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 15)

    const { systemPrompt, userPrompt } = buildDiscoveryPrompt({
      handle,
      profile: {
        username: profile.username,
        name: profile.name,
        biography: profile.biography,
        website: profile.website,
        followersCount: profile.followersCount,
        followsCount: profile.followsCount,
        mediaCount: profile.mediaCount,
      },
      content: { ...derived, captions },
      availability: profile.fieldsAvailability,
    })

    try {
      const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 3500 })
      const parsed = extractJson(result.text)

      const inputTokens = result.usage?.inputTokens
      const outputTokens = result.usage?.outputTokens
      const inputCostPer1k = Number(Deno.env.get('KIE_TEXT_INPUT_COST_PER_1K_USD') ?? '')
      const outputCostPer1k = Number(Deno.env.get('KIE_TEXT_OUTPUT_COST_PER_1K_USD') ?? '')
      const hasPricing = Number.isFinite(inputCostPer1k) && Number.isFinite(outputCostPer1k)
      const estimatedCostUsd =
        hasPricing && typeof inputTokens === 'number' && typeof outputTokens === 'number'
          ? Math.round(((inputTokens / 1000) * inputCostPer1k + (outputTokens / 1000) * outputCostPer1k) * 1e6) / 1e6
          : null

      await admin
        .from('pre_onboarding_sessions')
        .update({
          status: 'ready',
          dna_preliminar: (parsed as Record<string, unknown>),
          ideias_preliminares: (parsed as Record<string, unknown>).ideias ?? [],
          ai_provider: result.provider,
          ai_model: result.model,
          ai_usage: {
            input_tokens: inputTokens ?? null,
            output_tokens: outputTokens ?? null,
            estimated_cost_usd: estimatedCostUsd,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      return json({
        token,
        status: 'ready',
        handle,
        profile: {
          username: profile.username,
          name: profile.name,
          profilePictureUrl: profile.profilePictureUrl,
          followersCount: profile.followersCount,
          mediaCount: profile.mediaCount,
        },
        fieldsAvailability: profile.fieldsAvailability,
        dna: parsed,
      })
    } catch (err) {
      const message = err instanceof ProviderRequestError ? err.message : 'A análise por IA falhou.'
      await admin.from('pre_onboarding_sessions').update({ status: 'failed', error_code: 'ai_error', error_message: message }).eq('id', session.id)
      return json({ error: 'ai_error', message: 'Conseguimos encontrar seu perfil, mas tivemos um problema ao montar seu DNA. Tente novamente.', token, status: 'failed' }, 502)
    }
  } catch (err) {
    console.error('instagram-discovery-public-start: erro inesperado.', err)
    return json({ error: 'internal_error', message: 'Erro inesperado.' }, 500)
  }
})
