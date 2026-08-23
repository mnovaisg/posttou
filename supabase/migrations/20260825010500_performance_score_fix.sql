-- Fase 10 — correção encontrada durante os testes reais: Postgres não
-- suporta `OVER ()` em cima de agregados de conjunto ordenado
-- (percentile_cont) — "OVER is not supported for ordered-set aggregate".
-- Corrigido calculando os limites de winsorization em uma CTE agregada
-- separada (bounds) e cruzando (CROSS JOIN) com o pool de valores, em vez
-- de tentar usá-los como window function.
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

  select * into v_snapshot
  from public.content_performance_snapshots
  where instagram_publication_id = p_instagram_publication_id and collector_status = 'collected'
  order by target_at desc
  limit 1;

  if v_snapshot.id is null then
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
