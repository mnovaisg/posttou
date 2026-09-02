// Edge Function: gera um plano editorial para UM workspace (Fase 9).
// Dois chamadores possíveis:
//  (a) usuário autenticado (owner/admin) clicando "Gerar plano"/"Regenerar"
//      no modo assisted;
//  (b) pilot-cron-dispatcher (service_role, via x-posttou-cron-secret)
//      para workspaces semi_auto que precisam de novo plano.
// Nunca fala com a Meta; nunca aprova/gera conteúdo sozinho — só monta o
// PLANO (item 17). A aprovação/geração são passos separados.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getTextProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { brandProfileToPromptText, isBrandProfileReady } from '../_shared/ai-gateway/brand-context.ts'
import { buildPlannerPrompt, extractJson } from '../_shared/pilot/prompt.ts'
import type { ExperimentOverlay, HistoryItem, RadarCandidate, SlotCandidate } from '../_shared/pilot/prompt.ts'
import { addDays, todayInTimeZone, weekdayInTimeZone, zonedTimeToUtc } from '../_shared/pilot/timezone.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-posttou-cron-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const NOVELTY_REJECT_THRESHOLD = 35 // item 67: mesmo com Radar bom, histórico recente e parecido derruba o candidato
const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const body = await req.json().catch(() => null)
  const workspaceId = (body as Record<string, unknown> | null)?.workspaceId as string | undefined
  if (!workspaceId) return json({ error: 'missing_params', message: 'workspaceId é obrigatório.' }, 400)

  // Autenticação: cron interno (service_role) OU usuário owner/admin.
  const cronSecret = Deno.env.get('PILOT_WORKER_SECRET')
  const isInternalCaller = !!cronSecret && req.headers.get('x-posttou-cron-secret') === cronSecret

  if (!isInternalCaller) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401)
    const { data: isOwnerAdmin } = await userClient.rpc('has_workspace_role', { p_workspace_id: workspaceId, p_roles: ['owner', 'admin'] })
    if (!isOwnerAdmin) return json({ error: 'forbidden', message: 'Só owner/admin pode gerar o plano do Piloto.' }, 403)
  }

  const startedAt = Date.now()
  let runRow: { id: string } | null = null

  try {
    const { data: settings } = await admin.from('pilot_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
    if (!settings) return json({ error: 'not_configured', message: 'Piloto não configurado para este workspace.' }, 400)
    if (settings.status !== 'active') return json({ error: 'not_active', message: 'Piloto não está ativo.' }, 409)

    const { data: workspace } = await admin.from('workspaces').select('timezone').eq('id', workspaceId).single()
    const timezone = workspace?.timezone ?? 'America/Sao_Paulo'

    const { data: run } = await admin.from('pilot_runs').insert({ workspace_id: workspaceId, run_type: 'plan_generation', status: 'running' }).select('id').single()
    runRow = run

    const periodStart = todayInTimeZone(timezone)
    const periodEnd = addDays(periodStart, settings.planning_window_days - 1)

    // ── claim (ajuste 3: idempotência forte da janela rolante) ──
    const { data: plan, error: claimError } = await admin.rpc('claim_pilot_workspace_for_planning', {
      p_workspace_id: workspaceId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    })
    if (claimError || !plan) {
      await admin.from('pilot_runs').update({ status: 'failed', error_summary: claimError?.message ?? 'claim_failed', finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', runRow!.id)
      return json({ error: 'plan_in_progress', message: claimError?.message ?? 'Já existe um plano em andamento.' }, 409)
    }

    // ── candidatos de slot (Bloco 10): agenda semanal explícita do usuário
    // (pilot_schedule_slots), não mais o cross-product allowed_weekdays x
    // preferred_times.default. Cada slot pode carregar uma diretriz de
    // conteúdo, que viaja até o item do plano e o prompt de geração.
    const { data: scheduleSlots } = await admin
      .from('pilot_schedule_slots')
      .select('weekday, time_of_day, directive')
      .eq('workspace_id', workspaceId)
    const slotsByWeekday = new Map<number, { timeLabel: string; directive: string | null }[]>()
    for (const s of scheduleSlots ?? []) {
      const wd = s.weekday as number
      const list = slotsByWeekday.get(wd) ?? []
      list.push({ timeLabel: (s.time_of_day as string).slice(0, 5), directive: s.directive })
      slotsByWeekday.set(wd, list)
    }

    const slots: SlotCandidate[] = []
    let cursor = periodStart
    const now = Date.now()
    while (cursor <= periodEnd) {
      const wd = weekdayInTimeZone(cursor, timezone)
      for (const daySlot of slotsByWeekday.get(wd) ?? []) {
        const scheduledFor = zonedTimeToUtc(cursor, daySlot.timeLabel, timezone)
        if (scheduledFor.getTime() > now) {
          const { data: hasConflict } = await admin.rpc('pilot_check_slot_conflict', { p_workspace_id: workspaceId, p_scheduled_for: scheduledFor.toISOString(), p_exclude_plan_item_id: null })
          if (!hasConflict) {
            slots.push({ index: slots.length, scheduledForIso: scheduledFor.toISOString(), weekdayLabel: WEEKDAY_LABEL[wd], timeLabel: daySlot.timeLabel, directive: daySlot.directive })
          }
        }
      }
      cursor = addDays(cursor, 1)
    }

    // ── candidatos do Radar (item 14: thresholds configuráveis, nunca hardcoded sem justificativa) ──
    let radarCandidates: RadarCandidate[] = []
    if (settings.use_radar && slots.length) {
      const confidenceFilter = settings.radar_min_confidence === 'high' ? ['high'] : ['medium', 'high']
      const { data: usedElsewhere } = await admin
        .from('pilot_plan_items')
        .select('radar_opportunity_id')
        .eq('workspace_id', workspaceId)
        .not('radar_opportunity_id', 'is', null)
        .not('status', 'in', '(skipped,failed)')
      const excludeIds = new Set((usedElsewhere ?? []).map((r) => r.radar_opportunity_id as string))

      const { data: opportunities } = await admin
        .from('radar_opportunities')
        .select('id, brand_fit_breakdown, opportunity_score, confidence, status, expires_at, radar_clusters(theme_summary, primary_topic)')
        .eq('workspace_id', workspaceId)
        .in('status', ['new', 'saved'])
        .gte('opportunity_score', settings.radar_min_opportunity_score)
        .in('confidence', confidenceFilter)
        .order('opportunity_score', { ascending: false })
        .limit(10)

      radarCandidates = (opportunities ?? [])
        .filter((o) => !excludeIds.has(o.id) && (!o.expires_at || new Date(o.expires_at).getTime() > now))
        .slice(0, 5)
        .map((o) => ({
          id: o.id,
          themeSummary: (o.radar_clusters as unknown as { theme_summary: string })?.theme_summary ?? '',
          primaryTopic: (o.radar_clusters as unknown as { primary_topic: string | null })?.primary_topic ?? null,
          opportunityScore: o.opportunity_score,
          suggestedFormat: null,
        }))
    }

    // ── histórico recente (novelty/diversidade) ──
    const { data: recentContents } = await admin
      .from('contents')
      .select('title, caption, type, created_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15)
    const history: HistoryItem[] = (recentContents ?? []).map((c) => ({ title: c.title, type: c.type, createdAt: c.created_at }))

    // Fase 11 — overlay de experimento: nunca altera pilot_settings, só
    // dá uma dica extra pro planner nesta janela. Item 24: no máximo 1
    // experimento ativo por workspace (garantido pelo índice parcial).
    const { data: activeExperiment } = await admin
      .from('strategy_experiments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()
    let experimentOverlay: ExperimentOverlay | null = null
    if (activeExperiment) {
      const { count: alreadyTagged } = await admin
        .from('pilot_plan_items')
        .select('id', { count: 'exact', head: true })
        .eq('experiment_id', activeExperiment.id)
        .not('status', 'in', '(skipped,failed)')
      const remaining = Math.max(activeExperiment.target_sample_size - (alreadyTagged ?? 0), 0)
      if (remaining > 0) {
        experimentOverlay = {
          hypothesis: activeExperiment.hypothesis,
          dimension: activeExperiment.dimension,
          variant: activeExperiment.variant,
          remainingSlots: remaining,
        }
      }
    }

    if (!slots.length) {
      await admin.rpc('finalize_pilot_plan', { p_plan_id: plan.id })
      await admin.from('pilot_runs').update({ status: 'success', slots_evaluated: 0, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', runRow!.id)
      return json({ planId: plan.id, itemsCreated: 0, message: 'Nenhum slot livre nesta janela — calendário já ocupado ou nenhum dia/horário disponível.' })
    }

    const { data: brandProfile } = await admin.from('brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle()
    if (!isBrandProfileReady(brandProfile)) {
      await admin.rpc('cancel_pilot_plan', { p_plan_id: plan.id, p_reason: 'brand_dna_incomplete' })
      await admin.from('pilot_runs').update({ status: 'failed', error_summary: 'brand_dna_incomplete', finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', runRow!.id)
      return json({ error: 'brand_dna_incomplete', message: 'Complete o DNA da marca antes de gerar o plano.' }, 400)
    }

    let textProvider
    try {
      textProvider = getTextProvider()
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        await admin.rpc('cancel_pilot_plan', { p_plan_id: plan.id, p_reason: 'ai_not_configured' })
        await admin.from('pilot_runs').update({ status: 'failed', error_summary: 'ai_not_configured', finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq('id', runRow!.id)
        return json({ error: 'not_configured', message: 'Geração com IA não configurada (KIE_API_KEY ausente).' }, 501)
      }
      throw err
    }

    const { systemPrompt, userPrompt } = buildPlannerPrompt({
      brandProfileText: brandProfileToPromptText(brandProfile),
      slots,
      radarCandidates,
      history,
      maxPostsPerWindow: settings.max_posts_per_window,
      maxRadarPerWindow: settings.max_radar_per_window,
      allowedFormats: settings.allowed_formats,
      editorialMix: settings.editorial_mix,
      formatMix: settings.format_mix ?? null,
      temporaryObjective: settings.temporary_objective_expires_at && new Date(settings.temporary_objective_expires_at) > new Date() ? settings.temporary_objective : null,
      experiment: experimentOverlay,
    })

    const result = await textProvider.generateText({ systemPrompt, userPrompt, maxTokens: 2500 })
    const parsed = extractJson(result.text) as {
      items?: { slot_index?: number; editorial_role?: string; brand_pillar?: string; format?: string; topic?: string; angle?: string; reason?: string; radar_opportunity_id?: string | null }[]
    }

    const validRoles = new Set(['educativo', 'autoridade', 'relacionamento', 'venda'])
    const slotById = new Map(slots.map((s) => [s.index, s]))
    const radarById = new Map(radarCandidates.map((r) => [r.id, r]))
    const usedSlots = new Set<number>()
    let radarUsed = 0
    let itemsCreated = 0
    let experimentTagged = 0
    const experimentVariant = experimentOverlay?.variant as Record<string, string> | undefined

    for (const raw of parsed.items ?? []) {
      if (itemsCreated >= settings.max_posts_per_window) break; // item 9: limite backend, nunca confiar só na IA
      if (typeof raw.slot_index !== 'number' || !slotById.has(raw.slot_index) || usedSlots.has(raw.slot_index)) continue
      if (!raw.editorial_role || !validRoles.has(raw.editorial_role)) continue
      if (!raw.format || !(settings.allowed_formats as string[]).includes(raw.format)) continue
      if (!raw.topic?.trim()) continue

      let radarOpportunityId: string | null = null
      if (raw.radar_opportunity_id && radarById.has(raw.radar_opportunity_id) && radarUsed < settings.max_radar_per_window) {
        radarOpportunityId = raw.radar_opportunity_id
      }

      // item 67: novelty rejeita candidato mesmo com Radar bom, se parecido com algo recente.
      const { data: novelty } = await admin.rpc('radar_compute_novelty', { p_workspace_id: workspaceId, p_theme_summary: `${raw.topic} ${raw.angle ?? ''}`, p_lookback_days: 30 })
      if (Number(novelty ?? 100) < NOVELTY_REJECT_THRESHOLD) continue

      // Fase 11: o BACKEND decide se este item conta para o experimento
      // (nunca a IA — ela só recebeu a dica, não escolhe experiment_id).
      let matchesExperiment = false
      if (experimentVariant && experimentTagged < (experimentOverlay?.remainingSlots ?? 0)) {
        matchesExperiment = Object.entries(experimentVariant).every(([key, value]) => {
          if (key === 'editorial_role') return raw.editorial_role === value
          if (key === 'format') return raw.format === value
          return true
        })
      }

      const slot = slotById.get(raw.slot_index)!
      const { error: insertError } = await admin.from('pilot_plan_items').insert({
        pilot_plan_id: plan.id,
        workspace_id: workspaceId,
        scheduled_for: slot.scheduledForIso,
        editorial_role: raw.editorial_role,
        brand_pillar: raw.brand_pillar ?? null,
        objective: raw.editorial_role,
        format: raw.format,
        topic: raw.topic,
        angle: raw.angle ?? null,
        reason: raw.reason ?? null,
        radar_opportunity_id: radarOpportunityId,
        status: 'planned',
        source: 'pilot',
        experiment_id: matchesExperiment ? activeExperiment!.id : null,
        directive: slot.directive ?? null,
      })
      if (insertError) continue
      if (matchesExperiment) experimentTagged += 1

      usedSlots.add(raw.slot_index)
      if (radarOpportunityId) radarUsed += 1
      itemsCreated += 1
    }

    const { data: finalPlan } = await admin.rpc('finalize_pilot_plan', { p_plan_id: plan.id })

    await admin
      .from('pilot_runs')
      .update({
        status: 'success',
        plan_id: plan.id,
        slots_evaluated: slots.length,
        items_created: itemsCreated,
        radar_used: radarUsed,
        ai_calls: 1,
        estimated_ai_cost: { input_tokens: result.usage?.inputTokens ?? 0, output_tokens: result.usage?.outputTokens ?? 0 },
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', runRow!.id)

    return json({ planId: plan.id, status: finalPlan?.status, itemsCreated, radarUsed, slotsEvaluated: slots.length })
  } catch (err) {
    console.error('pilot-plan-generate: erro inesperado.', err)
    if (runRow) {
      await admin
        .from('pilot_runs')
        .update({ status: 'failed', error_summary: err instanceof Error ? err.message : 'Erro inesperado.', finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
        .eq('id', runRow.id)
    }
    return json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Erro inesperado.' }, 500)
  }
})
