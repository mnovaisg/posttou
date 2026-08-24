-- Fase 10 — RPCs de coleta, score determinístico e facts.
-- Todo o cálculo (baseline, score, facts) é SQL puro — nenhuma IA decide
-- número algum aqui (item 16/47 do plano).

-- ── Agenda os buckets pendentes para publicações já publicadas que ainda
-- não têm linha para algum bucket (idempotente via UNIQUE + ON CONFLICT).
-- Chamada pelo collector a cada tick, antes de reivindicar. ──
create or replace function public.ensure_performance_snapshots_scheduled(p_lookback_days integer default 8, p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inserted integer := 0;
  v_pub record;
  v_bucket record;
  v_offsets constant jsonb := '[{"bucket":"1h","hours":1},{"bucket":"6h","hours":6},{"bucket":"24h","hours":24},{"bucket":"72h","hours":72},{"bucket":"7d","hours":168}]'::jsonb;
begin
  for v_pub in
    select ip.id as publication_id, ip.content_id, ip.instagram_account_id, ip.published_at, c.workspace_id
    from public.instagram_publications ip
    join public.contents c on c.id = ip.content_id
    where ip.status = 'published'
      and ip.published_at >= now() - (p_lookback_days || ' days')::interval
    order by ip.published_at desc
    limit p_limit
  loop
    for v_bucket in select value ->> 'bucket' as bucket, (value ->> 'hours')::int as hours from jsonb_array_elements(v_offsets)
    loop
      insert into public.content_performance_snapshots (
        workspace_id, content_id, instagram_publication_id, instagram_account_id, age_bucket, target_at
      ) values (
        v_pub.workspace_id, v_pub.content_id, v_pub.publication_id, v_pub.instagram_account_id,
        v_bucket.bucket, v_pub.published_at + (v_bucket.hours || ' hours')::interval
      )
      on conflict (instagram_publication_id, age_bucket) do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    end loop;
  end loop;
  return v_inserted;
end;
$function$;

revoke all on function public.ensure_performance_snapshots_scheduled(integer, integer) from public, anon, authenticated;
grant execute on function public.ensure_performance_snapshots_scheduled(integer, integer) to service_role;

-- ── Reivindica buckets prontos para coleta (due e sem retry pendente),
-- FOR UPDATE SKIP LOCKED — mesmo padrão de claim_instagram_publications /
-- claim_pilot_plan_items_for_generation. Nunca bloqueado por retry
-- anterior (ajuste 4): status continua 'pending' entre tentativas. ──
create or replace function public.claim_performance_snapshots(p_limit integer default 50)
returns setof public.content_performance_snapshots
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.content_performance_snapshots;
begin
  for v_row in
    update public.content_performance_snapshots s
    set claimed_at = now(), attempt_count = s.attempt_count + 1, last_attempt_at = now(), updated_at = now()
    from (
      select id from public.content_performance_snapshots
      where collector_status = 'pending'
        and target_at <= now()
        and (next_retry_at is null or next_retry_at <= now())
      order by target_at asc
      limit p_limit
      for update skip locked
    ) eligible
    where s.id = eligible.id
    returning s.*
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;

revoke all on function public.claim_performance_snapshots(integer) from public, anon, authenticated;
grant execute on function public.claim_performance_snapshots(integer) to service_role;

-- ── Calcula o score determinístico de UMA publicação a partir do snapshot
-- mais recente já coletado + baseline da própria marca (ajustes 1, 2, 3). ──
create or replace function public.recompute_content_performance_score(p_instagram_publication_id uuid)
returns public.content_performance_scores
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pub record;
  v_snapshot record;
  v_cfg record;
  v_format public.content_type;
  v_age_hours numeric;
  v_maturity public.performance_maturity_stage;
  v_reach numeric; v_engagement numeric; v_saves numeric; v_shares numeric;
  v_pool_scope public.performance_baseline_scope;
  v_pool_size integer;
  v_pct_reach numeric; v_pct_engagement numeric; v_pct_saves numeric; v_pct_shares numeric;
  v_tier public.performance_baseline_tier;
  v_score smallint;
  v_result public.content_performance_scores;
begin
  select ip.id, ip.content_id, ip.published_at, c.workspace_id, c.type as format
  into v_pub
  from public.instagram_publications ip
  join public.contents c on c.id = ip.content_id
  where ip.id = p_instagram_publication_id;

  if v_pub.id is null then
    raise exception 'Publicação % não encontrada.', p_instagram_publication_id;
  end if;
  v_format := v_pub.format;

  -- Snapshot mais recente já coletado (não precisa ser o de 7d — ajuste 3:
  -- performance aparece desde o primeiro snapshot coletado).
  select * into v_snapshot
  from public.content_performance_snapshots
  where instagram_publication_id = p_instagram_publication_id and collector_status = 'collected'
  order by target_at desc
  limit 1;

  if v_snapshot.id is null then
    -- Nada coletado ainda: garante que existe uma linha "sem dados" (não decide UI).
    insert into public.content_performance_scores (workspace_id, content_id, instagram_publication_id, format)
    values (v_pub.workspace_id, v_pub.content_id, p_instagram_publication_id, v_format)
    on conflict (instagram_publication_id) do update set updated_at = now()
    returning * into v_result;
    return v_result;
  end if;

  v_age_hours := extract(epoch from (now() - v_pub.published_at)) / 3600.0;

  select * into v_cfg from public.performance_scoring_config where workspace_id = v_pub.workspace_id;
  if v_cfg.id is null then
    select * into v_cfg from public.performance_scoring_config where workspace_id is null;
  end if;

  v_maturity := case
    when v_age_hours >= (v_cfg.maturity_consolidated_days * 24) then 'consolidated'
    when v_age_hours >= v_cfg.maturity_evolving_hours then 'evolving'
    else 'initial'
  end;

  v_reach := v_snapshot.reach;
  v_engagement := case when v_snapshot.reach > 0 then v_snapshot.total_interactions::numeric / v_snapshot.reach else null end;
  v_saves := case when v_snapshot.reach > 0 then v_snapshot.saved::numeric / v_snapshot.reach else null end;
  v_shares := case when v_snapshot.reach > 0 then v_snapshot.shares::numeric / v_snapshot.reach else null end;

  -- Ajuste 2: baseline por formato primeiro; fallback pra baseline geral da
  -- própria marca se a amostra do formato não bastar. Nunca outra marca.
  -- Amostra = publicações com pelo menos um snapshot já coletado com
  -- reach > 0 (reach=0/null não entra no denominador de nenhuma métrica).
  select count(*) into v_pool_size
  from public.content_performance_snapshots cps
  join public.content_performance_scores cs on cs.instagram_publication_id = cps.instagram_publication_id
  where cs.workspace_id = v_pub.workspace_id and cs.format = v_format
    and cps.collector_status = 'collected' and cps.reach > 0
    and cps.instagram_publication_id <> p_instagram_publication_id;

  if v_pool_size >= v_cfg.min_sample_provisional then
    v_pool_scope := 'format';
  else
    select count(*) into v_pool_size
    from public.content_performance_snapshots cps
    join public.content_performance_scores cs on cs.instagram_publication_id = cps.instagram_publication_id
    where cs.workspace_id = v_pub.workspace_id
      and cps.collector_status = 'collected' and cps.reach > 0
      and cps.instagram_publication_id <> p_instagram_publication_id;
    v_pool_scope := 'workspace';
  end if;

  v_tier := case
    when v_pool_size >= v_cfg.min_sample_ready then 'baseline_ready'
    when v_pool_size >= v_cfg.min_sample_provisional then 'baseline_provisional'
    else 'collecting_data'
  end;

  if v_tier = 'collecting_data' then
    v_score := null; v_pct_reach := null; v_pct_engagement := null; v_pct_saves := null; v_pct_shares := null;
  else
    with pool as (
      select
        cps.reach as reach,
        case when cps.reach > 0 then cps.total_interactions::numeric / cps.reach end as engagement,
        case when cps.reach > 0 then cps.saved::numeric / cps.reach end as saves,
        case when cps.reach > 0 then cps.shares::numeric / cps.reach end as shares
      from public.content_performance_snapshots cps
      join public.content_performance_scores cs on cs.instagram_publication_id = cps.instagram_publication_id
      where cs.workspace_id = v_pub.workspace_id
        and (v_pool_scope = 'workspace' or cs.format = v_format)
        and cps.collector_status = 'collected' and cps.reach > 0
        and cps.instagram_publication_id <> p_instagram_publication_id
    ),
    bounds as (
      select
        percentile_cont(v_cfg.winsorize_low_pct) within group (order by reach) as reach_lo,
        percentile_cont(v_cfg.winsorize_high_pct) within group (order by reach) as reach_hi,
        percentile_cont(v_cfg.winsorize_low_pct) within group (order by engagement) as eng_lo,
        percentile_cont(v_cfg.winsorize_high_pct) within group (order by engagement) as eng_hi,
        percentile_cont(v_cfg.winsorize_low_pct) within group (order by saves) as saves_lo,
        percentile_cont(v_cfg.winsorize_high_pct) within group (order by saves) as saves_hi,
        percentile_cont(v_cfg.winsorize_low_pct) within group (order by shares) as shares_lo,
        percentile_cont(v_cfg.winsorize_high_pct) within group (order by shares) as shares_hi
      from pool
    )
    select
      avg(case when least(greatest(pool.reach, b.reach_lo), b.reach_hi) <= least(greatest(v_reach, b.reach_lo), b.reach_hi) then 1.0 else 0.0 end),
      avg(case when pool.engagement is not null and least(greatest(pool.engagement, b.eng_lo), b.eng_hi) <= least(greatest(v_engagement, b.eng_lo), b.eng_hi) then 1.0 else 0.0 end),
      avg(case when pool.saves is not null and least(greatest(pool.saves, b.saves_lo), b.saves_hi) <= least(greatest(v_saves, b.saves_lo), b.saves_hi) then 1.0 else 0.0 end),
      avg(case when pool.shares is not null and least(greatest(pool.shares, b.shares_lo), b.shares_hi) <= least(greatest(v_shares, b.shares_lo), b.shares_hi) then 1.0 else 0.0 end)
    into v_pct_reach, v_pct_engagement, v_pct_saves, v_pct_shares
    from pool, bounds b;

    v_score := round(100 * (
      coalesce(v_pct_reach, 0.5) * v_cfg.weight_reach +
      coalesce(v_pct_engagement, 0.5) * v_cfg.weight_engagement +
      coalesce(v_pct_saves, 0.5) * v_cfg.weight_saves +
      coalesce(v_pct_shares, 0.5) * v_cfg.weight_shares
    ) / (v_cfg.weight_reach + v_cfg.weight_engagement + v_cfg.weight_saves + v_cfg.weight_shares));
  end if;

  insert into public.content_performance_scores (
    workspace_id, content_id, instagram_publication_id, format, maturity_stage, latest_age_bucket,
    baseline_tier, baseline_scope, baseline_sample_size, score,
    relative_reach, relative_engagement, relative_saves, relative_shares,
    scoring_config_snapshot, computed_at, updated_at
  ) values (
    v_pub.workspace_id, v_pub.content_id, p_instagram_publication_id, v_format, v_maturity, v_snapshot.age_bucket,
    v_tier, case when v_tier = 'collecting_data' then null else v_pool_scope end, v_pool_size, v_score,
    v_pct_reach, v_pct_engagement, v_pct_saves, v_pct_shares,
    to_jsonb(v_cfg), now(), now()
  )
  on conflict (instagram_publication_id) do update set
    format = excluded.format,
    maturity_stage = excluded.maturity_stage,
    latest_age_bucket = excluded.latest_age_bucket,
    baseline_tier = excluded.baseline_tier,
    baseline_scope = excluded.baseline_scope,
    baseline_sample_size = excluded.baseline_sample_size,
    score = excluded.score,
    relative_reach = excluded.relative_reach,
    relative_engagement = excluded.relative_engagement,
    relative_saves = excluded.relative_saves,
    relative_shares = excluded.relative_shares,
    scoring_config_snapshot = excluded.scoring_config_snapshot,
    computed_at = excluded.computed_at,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.recompute_content_performance_score(uuid) from public, anon, authenticated;
grant execute on function public.recompute_content_performance_score(uuid) to service_role;

comment on function public.recompute_content_performance_score(uuid) is 'Fase 10: score determinístico (0-100), percentil winsorizado vs baseline da própria marca (formato com fallback pra workspace — ajuste 2). Nunca compara com outra marca. score fica null enquanto baseline_tier=collecting_data (ajuste 1).';

-- ── Marca feedback/dismiss em um insight (única escrita autenticada
-- permitida nesta feature — usuário do próprio workspace só). ──
create or replace function public.set_performance_insight_feedback(p_insight_id uuid, p_feedback public.performance_insight_feedback default null, p_dismiss boolean default false)
returns public.performance_insights
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_insight public.performance_insights;
begin
  select * into v_insight from public.performance_insights where id = p_insight_id;
  if v_insight.id is null then
    raise exception 'Insight não encontrado.';
  end if;
  if not public.is_workspace_member(v_insight.workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  update public.performance_insights
  set feedback = coalesce(p_feedback, feedback),
      status = case when p_dismiss then 'dismissed'::public.performance_insight_status else status end,
      dismissed_at = case when p_dismiss then now() else dismissed_at end
  where id = p_insight_id
  returning * into v_insight;

  perform public.log_audit_event(v_insight.workspace_id, 'performance_insight_dismissed', 'performance_insights', v_insight.id, jsonb_build_object('feedback', p_feedback, 'dismissed', p_dismiss));

  return v_insight;
end;
$function$;

revoke all on function public.set_performance_insight_feedback(uuid, public.performance_insight_feedback, boolean) from public, anon;
grant execute on function public.set_performance_insight_feedback(uuid, public.performance_insight_feedback, boolean) to authenticated;
