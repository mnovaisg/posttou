-- Fase 13, ajuste 2 — expõe auto_generate_art em upsert_pilot_settings.
-- Mesma técnica já usada pra adicionar format_mix na Fase 11: novo
-- parâmetro com default no fim + DROP explícito da assinatura antiga (o
-- PostgREST resolveria a chamada ambiguamente entre as 2 sobrecargas).
create or replace function public.upsert_pilot_settings(
  p_workspace_id uuid,
  p_mode public.pilot_mode,
  p_planning_window_days integer,
  p_max_posts_per_window integer,
  p_allowed_weekdays integer[],
  p_preferred_times jsonb,
  p_allowed_formats public.content_type[],
  p_editorial_mix jsonb,
  p_use_radar boolean,
  p_max_radar_per_window integer,
  p_radar_min_opportunity_score numeric,
  p_radar_min_confidence text,
  p_temporary_objective text,
  p_temporary_objective_expires_at timestamptz,
  p_default_instagram_account_id uuid,
  p_max_credits_per_window bigint,
  p_format_mix jsonb default null,
  p_auto_generate_art boolean default false
)
returns public.pilot_settings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.pilot_settings;
  v_wd integer;
  v_fmt public.content_type;
  v_sum numeric;
  v_normalized jsonb;
  v_format_mix_normalized jsonb;
  v_format_mix_sum numeric;
  v_key text;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode configurar o Piloto.';
  end if;

  if p_allowed_weekdays is null or array_length(p_allowed_weekdays, 1) is null then
    raise exception 'Selecione ao menos um dia da semana.';
  end if;
  foreach v_wd in array p_allowed_weekdays loop
    if v_wd < 0 or v_wd > 6 then
      raise exception 'Dia da semana inválido: % (use 0=domingo..6=sábado).', v_wd;
    end if;
  end loop;

  if p_allowed_formats is null or array_length(p_allowed_formats, 1) is null then
    raise exception 'Selecione ao menos um formato.';
  end if;
  foreach v_fmt in array p_allowed_formats loop
    if v_fmt = 'reel' then
      raise exception 'Reel ainda não é suportado pelo Piloto (sem pipeline de vídeo real).';
    end if;
  end loop;

  if not (p_editorial_mix ?& array['educativo', 'autoridade', 'relacionamento', 'venda']) then
    raise exception 'editorial_mix precisa ter as 4 chaves: educativo, autoridade, relacionamento, venda.';
  end if;
  select sum((value)::numeric) into v_sum from jsonb_each_text(p_editorial_mix);
  if v_sum is null or v_sum <= 0 then
    raise exception 'editorial_mix precisa ter pelo menos um valor positivo.';
  end if;
  select jsonb_object_agg(key, round((value::numeric / v_sum) * 100, 1)) into v_normalized from jsonb_each_text(p_editorial_mix);

  if p_format_mix is not null then
    for v_key in select jsonb_object_keys(p_format_mix) loop
      if v_key = 'reel' or not (v_key = any(p_allowed_formats::text[])) then
        raise exception 'format_mix contém formato não permitido: %.', v_key;
      end if;
    end loop;
    select sum((value)::numeric) into v_format_mix_sum from jsonb_each_text(p_format_mix);
    if v_format_mix_sum is null or v_format_mix_sum <= 0 then
      raise exception 'format_mix precisa ter pelo menos um valor positivo.';
    end if;
    select jsonb_object_agg(key, round((value::numeric / v_format_mix_sum) * 100, 1)) into v_format_mix_normalized from jsonb_each_text(p_format_mix);
  else
    v_format_mix_normalized := null;
  end if;

  if p_default_instagram_account_id is not null
    and not exists (select 1 from public.instagram_accounts where id = p_default_instagram_account_id and workspace_id = p_workspace_id)
  then
    raise exception 'Conta do Instagram inválida para este workspace.';
  end if;

  insert into public.pilot_settings (
    workspace_id, mode, planning_window_days, max_posts_per_window, allowed_weekdays, preferred_times,
    allowed_formats, editorial_mix, use_radar, max_radar_per_window, radar_min_opportunity_score,
    radar_min_confidence, temporary_objective, temporary_objective_expires_at, default_instagram_account_id,
    max_credits_per_window, format_mix, auto_generate_art
  ) values (
    p_workspace_id, p_mode, p_planning_window_days, p_max_posts_per_window, p_allowed_weekdays, p_preferred_times,
    p_allowed_formats, v_normalized, p_use_radar, p_max_radar_per_window, p_radar_min_opportunity_score,
    p_radar_min_confidence, p_temporary_objective, p_temporary_objective_expires_at, p_default_instagram_account_id,
    p_max_credits_per_window, v_format_mix_normalized, coalesce(p_auto_generate_art, false)
  )
  on conflict (workspace_id) do update set
    mode = excluded.mode,
    planning_window_days = excluded.planning_window_days,
    max_posts_per_window = excluded.max_posts_per_window,
    allowed_weekdays = excluded.allowed_weekdays,
    preferred_times = excluded.preferred_times,
    allowed_formats = excluded.allowed_formats,
    editorial_mix = excluded.editorial_mix,
    use_radar = excluded.use_radar,
    max_radar_per_window = excluded.max_radar_per_window,
    radar_min_opportunity_score = excluded.radar_min_opportunity_score,
    radar_min_confidence = excluded.radar_min_confidence,
    temporary_objective = excluded.temporary_objective,
    temporary_objective_expires_at = excluded.temporary_objective_expires_at,
    default_instagram_account_id = excluded.default_instagram_account_id,
    max_credits_per_window = excluded.max_credits_per_window,
    format_mix = excluded.format_mix,
    auto_generate_art = excluded.auto_generate_art,
    updated_at = now()
  returning * into v_row;

  perform public.log_audit_event(p_workspace_id, 'pilot_settings_updated', 'pilot_settings', v_row.id, '{}'::jsonb);
  return v_row;
end;
$function$;

revoke all on function public.upsert_pilot_settings(uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamptz, uuid, bigint, jsonb, boolean) from public, anon;
grant execute on function public.upsert_pilot_settings(uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamptz, uuid, bigint, jsonb, boolean) to authenticated;

drop function if exists public.upsert_pilot_settings(uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamptz, uuid, bigint, jsonb);
