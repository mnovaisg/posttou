// Fase 12 — Análise de referência de marca. Ação SEPARADA de
// add_brand_reference (ajuste 3 — consentimento explícito): adicionar uma
// referência NUNCA dispara análise sozinho. Este endpoint só roda quando o
// usuário clica numa ação explícita ("Analisar referência"). Reaproveita a
// Business Discovery da Fase 6 (mesmo mecanismo oficial, nenhum scraping) —
// se a Meta negar (permissão/API), documentamos o status real
// (permission_required/unavailable), nunca inventamos dado.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { BusinessDiscoveryError, computeDerivedData, fetchBusinessDiscovery } from '../_shared/instagram/business-discovery-provider.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)

    const body = await req.json().catch(() => null)
    const referenceId = (body as Record<string, unknown> | null)?.referenceId
    if (typeof referenceId !== 'string' || !referenceId) return json({ error: 'referenceId é obrigatório.' }, 400)

    const { data: reference } = await admin.from('brand_reference_profiles').select('*').eq('id', referenceId).is('removed_at', null).maybeSingle()
    if (!reference) return json({ error: 'Referência não encontrada.' }, 404)

    // Owner/Admin apenas — item 4 da missão. Verificado via RPC com o JWT
    // do usuário (mesma régua de add_brand_reference/remove_brand_reference).
    const { data: hasRole } = await userClient.rpc('has_workspace_role', {
      p_workspace_id: reference.workspace_id,
      p_roles: ['owner', 'admin'],
    })
    if (!hasRole) return json({ error: 'Só owner/admin pode analisar referências.' }, 403)

    const appId = Deno.env.get('INSTAGRAM_DISCOVERY_APP_ID')
    const callerToken = Deno.env.get('INSTAGRAM_DISCOVERY_CALLER_ACCESS_TOKEN')
    const callerIgUserId = Deno.env.get('INSTAGRAM_DISCOVERY_CALLER_IG_USER_ID')
    if (!appId || !callerToken || !callerIgUserId) {
      return json({ error: 'not_configured', message: 'A análise automática de referências ainda não está configurada neste ambiente.' }, 501)
    }

    await admin.from('brand_reference_profiles').update({ status: 'analysis_pending', updated_at: new Date().toISOString() }).eq('id', referenceId)

    let profile: Awaited<ReturnType<typeof fetchBusinessDiscovery>>
    let usedCachedSnapshot = false

    const { data: cached } = await admin
      .from('instagram_handle_snapshots')
      .select('*')
      .eq('handle', reference.handle)
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      usedCachedSnapshot = true
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
        profile = await fetchBusinessDiscovery({ callerIgUserId, callerAccessToken: callerToken, targetHandle: reference.handle })
      } catch (err) {
        const code = err instanceof BusinessDiscoveryError ? err.code : 'provider_error'
        const message = err instanceof Error ? err.message : 'Erro inesperado ao consultar o Instagram.'
        // Blocker real e documentado (nunca contornado): permissão negada
        // pela Meta ou perfil realmente inacessível. Referência manual
        // continua funcionando normalmente (item 4 da missão).
        const status = code === 'profile_not_found' ? 'unavailable' : code === 'permission_error' || code === 'forbidden' ? 'permission_required' : 'unavailable'
        await admin
          .from('brand_reference_profiles')
          .update({ status, analysis_error_code: code, analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', referenceId)
        await userClient.rpc('log_audit_event', {
          p_workspace_id: reference.workspace_id,
          p_action: 'brand_reference_analysis_failed',
          p_resource_type: 'brand_reference_profiles',
          p_resource_id: referenceId,
          p_metadata: { error_code: code },
        })
        return json({ status, error: code, message }, 200)
      }

      await admin.from('instagram_handle_snapshots').insert({
        handle: reference.handle,
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
    }

    // Só agregados derivados deterministicamente — nunca legenda integral
    // (item 7 da missão: nada de "copiar" texto de referência).
    const derived = computeDerivedData(profile.media)
    const analysis = {
      biography: profile.biography ?? null,
      website: profile.website ?? null,
      followers_count: profile.followersCount ?? null,
      media_count: profile.mediaCount ?? null,
      format_distribution: derived.formatDistribution,
      avg_posts_per_week: derived.avgPostsPerWeek,
      avg_like_count: derived.avgLikeCount,
      avg_comments_count: derived.avgCommentsCount,
      fields_availability: profile.fieldsAvailability,
      used_cached_snapshot: usedCachedSnapshot,
    }

    const { data: updated } = await admin
      .from('brand_reference_profiles')
      .update({
        status: 'analyzed',
        ig_user_id: profile.igUserId,
        analysis,
        analyzed_at: new Date().toISOString(),
        analysis_error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', referenceId)
      .select()
      .single()

    await userClient.rpc('log_audit_event', {
      p_workspace_id: reference.workspace_id,
      p_action: 'brand_reference_analyzed',
      p_resource_type: 'brand_reference_profiles',
      p_resource_id: referenceId,
      p_metadata: { handle: reference.handle, used_cached_snapshot: usedCachedSnapshot },
    })

    return json({ status: 'analyzed', reference: updated })
  } catch (err) {
    console.error('Erro inesperado em brand-reference-analyze', err)
    return json({ error: 'Erro inesperado ao processar a solicitação.' }, 500)
  }
})
