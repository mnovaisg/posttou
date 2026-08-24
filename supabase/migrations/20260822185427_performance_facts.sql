-- Fase 10 — facts determinísticos (SQL puro) que alimentam tanto os
-- insights 100% determinísticos (ajuste 7 — sem LLM quando os facts já
-- sustentam a afirmação) quanto o payload estruturado passado pra IA
-- quando síntese/interpretação é necessária. Nenhum número é decidido
-- fora desta função.
create or replace function public.compute_performance_facts(p_workspace_id uuid, p_period_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period_start date := (current_date - p_period_days);
  v_period_end date := current_date;
  v_prev_start date := (current_date - (p_period_days * 2));
  v_prev_end date := v_period_start;
  v_overall jsonb;
  v_by_format jsonb;
  v_by_origin jsonb;
  v_by_role jsonb;
  v_by_hour jsonb;
  v_best_format jsonb;
  v_best_role jsonb;
  v_best_origin jsonb;
  v_cfg record;
begin
  -- auth.uid() só é null quando a chamada vem de service_role sem JWT de
  -- usuário (Edge Functions internas) — impossível de falsificar por
  -- authenticated/anon, que sempre carregam seu próprio auth.uid() real.
  if auth.uid() is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_cfg from public.performance_scoring_config where workspace_id = p_workspace_id;
  if v_cfg.id is null then
    select * into v_cfg from public.performance_scoring_config where workspace_id is null;
  end if;

  with current_period as (
    select cs.*, c.origin, c.published_at, ip.published_at as pub_at
    from public.content_performance_scores cs
    join public.contents c on c.id = cs.content_id
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id
      and ip.published_at::date >= v_period_start and ip.published_at::date <= v_period_end
      and cs.score is not null
  ),
  previous_period as (
    select cs.*, ip.published_at as pub_at
    from public.content_performance_scores cs
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id
      and ip.published_at::date >= v_prev_start and ip.published_at::date < v_prev_end
      and cs.score is not null
  )
  select jsonb_build_object(
    'avg_score', round(avg(cur.score)::numeric, 1),
    'avg_score_previous', (select round(avg(score)::numeric, 1) from previous_period),
    'avg_relative_reach', round(avg(cur.relative_reach)::numeric, 3),
    'avg_relative_engagement', round(avg(cur.relative_engagement)::numeric, 3),
    'sample_size', count(*),
    'sample_size_previous', (select count(*) from previous_period)
  )
  into v_overall
  from current_period cur;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_by_format
  from (
    select jsonb_build_object('format', c.type, 'avg_score', round(avg(cs.score)::numeric, 1), 'sample_size', count(*)) as entry
    from public.content_performance_scores cs
    join public.contents c on c.id = cs.content_id
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id and cs.score is not null
      and ip.published_at::date >= v_period_start and ip.published_at::date <= v_period_end
    group by c.type
  ) t;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_by_origin
  from (
    select jsonb_build_object('origin', c.origin, 'avg_score', round(avg(cs.score)::numeric, 1), 'sample_size', count(*)) as entry
    from public.content_performance_scores cs
    join public.contents c on c.id = cs.content_id
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id and cs.score is not null
      and ip.published_at::date >= v_period_start and ip.published_at::date <= v_period_end
    group by c.origin
  ) t;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_by_role
  from (
    select jsonb_build_object('editorial_role', ppi.editorial_role, 'avg_score', round(avg(cs.score)::numeric, 1), 'sample_size', count(*)) as entry
    from public.content_performance_scores cs
    join public.contents c on c.id = cs.content_id
    join public.pilot_plan_items ppi on ppi.id = c.pilot_plan_item_id
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id and cs.score is not null
      and ip.published_at::date >= v_period_start and ip.published_at::date <= v_period_end
    group by ppi.editorial_role
  ) t;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_by_hour
  from (
    select jsonb_build_object('hour', extract(hour from ip.published_at), 'avg_score', round(avg(cs.score)::numeric, 1), 'sample_size', count(*)) as entry
    from public.content_performance_scores cs
    join public.instagram_publications ip on ip.id = cs.instagram_publication_id
    where cs.workspace_id = p_workspace_id and cs.score is not null
      and ip.published_at::date >= v_period_start and ip.published_at::date <= v_period_end
    group by extract(hour from ip.published_at)
  ) t;

  select entry into v_best_format from (
    select entry from jsonb_array_elements(v_by_format) entry
    where (entry ->> 'sample_size')::int >= v_cfg.min_sample_provisional
    order by (entry ->> 'avg_score')::numeric desc
    limit 1
  ) t;

  select entry into v_best_role from (
    select entry from jsonb_array_elements(v_by_role) entry
    where (entry ->> 'sample_size')::int >= v_cfg.min_sample_provisional
    order by (entry ->> 'avg_score')::numeric desc
    limit 1
  ) t;

  select entry into v_best_origin from (
    select entry from jsonb_array_elements(v_by_origin) entry
    where (entry ->> 'sample_size')::int >= v_cfg.min_sample_provisional
    order by (entry ->> 'avg_score')::numeric desc
    limit 1
  ) t;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'previous_period_start', v_prev_start,
    'previous_period_end', v_prev_end,
    'overall', coalesce(v_overall, '{}'::jsonb),
    'by_format', v_by_format,
    'by_origin', v_by_origin,
    'by_editorial_role', v_by_role,
    'by_hour', v_by_hour,
    'best_format', v_best_format,
    'best_editorial_role', v_best_role,
    'best_origin', v_best_origin,
    'min_sample_provisional', v_cfg.min_sample_provisional
  );
end;
$function$;

revoke all on function public.compute_performance_facts(uuid, integer) from public, anon;
grant execute on function public.compute_performance_facts(uuid, integer) to authenticated, service_role;

comment on function public.compute_performance_facts(uuid, integer) is 'Fase 10: facts 100% determinísticos (médias, deltas, melhores dimensões com sample_size mínimo) — única fonte de números permitida em qualquer texto gerado por IA (ajuste 7).';
