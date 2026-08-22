-- Fase 8 — Radar Viral: RPCs.
-- Mesmo princípio do marcador local de transação usado no worker de
-- publicação (Fase 7): 'radar_worker' é aceito como actor de sistema em
-- log_audit_event, mas só dentro das RPCs abaixo que o setam
-- explicitamente — nunca por chamada direta.
create or replace function public.log_audit_event(p_workspace_id uuid, p_action text, p_resource_type text, p_resource_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns public.audit_logs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log public.audit_logs;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if v_system_actor in ('instagram_publish_worker', 'radar_worker') then
    insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
    values (p_workspace_id, null, p_action, p_resource_type, p_resource_id, p_metadata || jsonb_build_object('actor', v_system_actor))
    returning * into v_log;
    return v_log;
  end if;

  if p_workspace_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem permissão para registrar auditoria neste workspace.';
  end if;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (p_workspace_id, auth.uid(), p_action, p_resource_type, p_resource_id, p_metadata)
  returning * into v_log;

  return v_log;
end;
$function$;

-- ── Novelty lexical (item 2 da aprovação): função isolada por design —
-- trocar para similaridade semântica no futuro (embeddings) só exige
-- reimplementar esta função e usar novelty_method='semantic'; nenhuma
-- migration de schema é necessária.
create or replace function public.radar_compute_novelty(p_workspace_id uuid, p_theme_summary text, p_lookback_days integer default 60)
returns numeric
language sql
security definer
set search_path to 'public'
stable
as $function$
  select coalesce(
    (100 - max(similarity(p_theme_summary, coalesce(c.title, '') || ' ' || coalesce(c.caption, ''))) * 100)::numeric,
    100
  )
  from public.contents c
  where c.workspace_id = p_workspace_id
    and c.deleted_at is null
    and c.created_at >= now() - (p_lookback_days || ' days')::interval;
$function$;

comment on function public.radar_compute_novelty(uuid, text, integer) is 'novelty_score lexical (pg_trgm) do MVP — 100 = tema nunca abordado recentemente. Ponto de extensão único para trocar por similaridade semântica futuramente (item 2 da aprovação da Fase 8), sem alterar schema.';

revoke all on function public.radar_compute_novelty(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.radar_compute_novelty(uuid, text, integer) to service_role;

-- ── Upsert de oportunidade (item 6 da aprovação): evita recriar
-- oportunidades ativas duplicadas a cada run. unique(workspace_id,
-- cluster_id) + ON CONFLICT ... WHERE status in ('new','saved') garante
-- que uma oportunidade já 'used'/'dismissed'/'expired' nunca é
-- silenciosamente ressuscitada por um novo run.
create or replace function public.upsert_radar_opportunity(
  p_workspace_id uuid,
  p_cluster_id uuid,
  p_brand_fit_score numeric,
  p_brand_fit_breakdown jsonb,
  p_novelty_score numeric,
  p_novelty_method text,
  p_opportunity_score numeric,
  p_confidence text,
  p_suggested_title text,
  p_suggested_angle text,
  p_suggested_format public.content_type,
  p_ai_generation_id uuid,
  p_expires_at timestamptz
)
returns setof public.radar_opportunities
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.radar_opportunities;
  v_created boolean;
begin
  perform set_config('posttou.system_actor', 'radar_worker', true);

  insert into public.radar_opportunities (
    workspace_id, cluster_id, brand_fit_score, brand_fit_breakdown, novelty_score, novelty_method,
    opportunity_score, confidence, suggested_title, suggested_angle, suggested_format,
    ai_generation_id, expires_at
  ) values (
    p_workspace_id, p_cluster_id, p_brand_fit_score, p_brand_fit_breakdown, p_novelty_score, p_novelty_method,
    p_opportunity_score, p_confidence, p_suggested_title, p_suggested_angle, p_suggested_format,
    p_ai_generation_id, p_expires_at
  )
  on conflict (workspace_id, cluster_id) do update set
    brand_fit_score = excluded.brand_fit_score,
    brand_fit_breakdown = excluded.brand_fit_breakdown,
    novelty_score = excluded.novelty_score,
    novelty_method = excluded.novelty_method,
    opportunity_score = excluded.opportunity_score,
    confidence = excluded.confidence,
    suggested_title = excluded.suggested_title,
    suggested_angle = excluded.suggested_angle,
    suggested_format = excluded.suggested_format,
    ai_generation_id = coalesce(excluded.ai_generation_id, public.radar_opportunities.ai_generation_id),
    last_seen_at = now(),
    expires_at = excluded.expires_at,
    updated_at = now()
  where public.radar_opportunities.status in ('new', 'saved')
  returning (xmax = 0) into v_created;

  select * into v_row from public.radar_opportunities where workspace_id = p_workspace_id and cluster_id = p_cluster_id;

  perform public.log_audit_event(
    p_workspace_id,
    case when v_created then 'radar_opportunity_created' else 'radar_opportunity_updated' end,
    'radar_opportunities', v_row.id,
    jsonb_build_object('cluster_id', p_cluster_id, 'opportunity_score', p_opportunity_score)
  );

  return next v_row;
end;
$function$;

revoke all on function public.upsert_radar_opportunity(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, text, text, public.content_type, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_radar_opportunity(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, text, text, public.content_type, uuid, timestamptz) to service_role;

-- ── Transições de status pelo usuário ("Salvar oportunidade"/"Não me interessa") ──
create or replace function public.set_radar_opportunity_status(p_opportunity_id uuid, p_status text, p_dismissed_reason text default null)
returns public.radar_opportunities
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.radar_opportunities;
begin
  if p_status not in ('saved', 'dismissed', 'new') then
    raise exception 'Status inválido para esta transição: %', p_status;
  end if;

  select * into v_row from public.radar_opportunities where id = p_opportunity_id;
  if v_row.id is null then
    raise exception 'Oportunidade não encontrada.';
  end if;
  if not public.is_workspace_member(v_row.workspace_id) then
    raise exception 'Sem permissão para esta oportunidade.';
  end if;
  if v_row.status = 'used' then
    raise exception 'Esta oportunidade já foi transformada em conteúdo e não pode mudar de status.';
  end if;

  update public.radar_opportunities
  set status = p_status,
      dismissed_reason = case when p_status = 'dismissed' then p_dismissed_reason else null end,
      updated_at = now()
  where id = p_opportunity_id
  returning * into v_row;

  perform public.log_audit_event(
    v_row.workspace_id, 'radar_opportunity_' || p_status, 'radar_opportunities', v_row.id,
    jsonb_build_object('cluster_id', v_row.cluster_id)
  );

  return v_row;
end;
$function$;

revoke all on function public.set_radar_opportunity_status(uuid, text, text) from public, anon;
grant execute on function public.set_radar_opportunity_status(uuid, text, text) to authenticated;

-- ── Rastreabilidade content → radar_opportunity_id ("Transformar em conteúdo") ──
create or replace function public.link_radar_opportunity_content(p_opportunity_id uuid, p_content_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_opp public.radar_opportunities;
  v_content_workspace uuid;
begin
  select * into v_opp from public.radar_opportunities where id = p_opportunity_id;
  if v_opp.id is null then
    raise exception 'Oportunidade não encontrada.';
  end if;
  if not public.is_workspace_member(v_opp.workspace_id) then
    raise exception 'Sem permissão para esta oportunidade.';
  end if;
  if v_opp.status = 'used' then
    raise exception 'Esta oportunidade já foi transformada em conteúdo anteriormente.';
  end if;

  select workspace_id into v_content_workspace from public.contents where id = p_content_id;
  if v_content_workspace is null or v_content_workspace <> v_opp.workspace_id then
    raise exception 'Conteúdo não pertence ao mesmo workspace da oportunidade.';
  end if;

  update public.radar_opportunities
  set status = 'used', used_content_id = p_content_id, updated_at = now()
  where id = p_opportunity_id;

  update public.contents set radar_opportunity_id = p_opportunity_id where id = p_content_id;

  perform public.log_audit_event(
    v_opp.workspace_id, 'radar_content_created', 'radar_opportunities', p_opportunity_id,
    jsonb_build_object('content_id', p_content_id, 'cluster_id', v_opp.cluster_id)
  );
end;
$function$;

revoke all on function public.link_radar_opportunity_content(uuid, uuid) from public, anon;
grant execute on function public.link_radar_opportunity_content(uuid, uuid) to authenticated;
