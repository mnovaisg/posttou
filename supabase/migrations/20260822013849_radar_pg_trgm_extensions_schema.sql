-- Advisor apontou pg_trgm instalada no schema public (mesmo padrão já
-- usado para pg_net neste projeto: extensões vivem no schema "extensions").
drop extension if exists pg_trgm;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.radar_compute_novelty(p_workspace_id uuid, p_theme_summary text, p_lookback_days integer default 60)
returns numeric
language sql
security definer
set search_path to 'public, extensions'
stable
as $function$
  select coalesce(
    (100 - max(extensions.similarity(p_theme_summary, coalesce(c.title, '') || ' ' || coalesce(c.caption, ''))) * 100)::numeric,
    100
  )
  from public.contents c
  where c.workspace_id = p_workspace_id
    and c.deleted_at is null
    and c.created_at >= now() - (p_lookback_days || ' days')::interval;
$function$;

revoke all on function public.radar_compute_novelty(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.radar_compute_novelty(uuid, text, integer) to service_role;
