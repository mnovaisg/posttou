-- Fase 9 — Piloto Automático: RPCs.
-- Convenções: toda mutação workspace-scoped passa por aqui (nunca UPDATE
-- direto do frontend). Funções chamadas só por Edge Functions/worker
-- (service_role) são explicitamente revogadas de authenticated/anon.

-- ═══════════════════ SETTINGS ═══════════════════
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
  p_max_credits_per_window bigint
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

  if p_default_instagram_account_id is not null
    and not exists (select 1 from public.instagram_accounts where id = p_default_instagram_account_id and workspace_id = p_workspace_id)
  then
    raise exception 'Conta do Instagram inválida para este workspace.';
  end if;

  insert into public.pilot_settings (
    workspace_id, mode, planning_window_days, max_posts_per_window, allowed_weekdays, preferred_times,
    allowed_formats, editorial_mix, use_radar, max_radar_per_window, radar_min_opportunity_score,
    radar_min_confidence, temporary_objective, temporary_objective_expires_at, default_instagram_account_id,
    max_credits_per_window
  ) values (
    p_workspace_id, p_mode, p_planning_window_days, p_max_posts_per_window, p_allowed_weekdays, p_preferred_times,
    p_allowed_formats, v_normalized, p_use_radar, p_max_radar_per_window, p_radar_min_opportunity_score,
    p_radar_min_confidence, p_temporary_objective, p_temporary_objective_expires_at, p_default_instagram_account_id,
    p_max_credits_per_window
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
    updated_at = now()
  returning * into v_row;

  perform public.log_audit_event(p_workspace_id, 'pilot_settings_updated', 'pilot_settings', v_row.id, '{}'::jsonb);
  return v_row;
end;
$function$;

revoke all on function public.upsert_pilot_settings(uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamptz, uuid, bigint) from public, anon;
grant execute on function public.upsert_pilot_settings(uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamptz, uuid, bigint) to authenticated;

-- item 38: checklist de ativação, retorna exatamente o que falta.
create or replace function public.check_pilot_activation_readiness(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
stable
as $function$
declare
  v_settings public.pilot_settings;
  v_brand public.brand_profiles;
  v_balance bigint;
  v_min_cost bigint;
  v_missing text[] := '{}';
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = p_workspace_id;
  if v_settings.id is null then
    v_missing := v_missing || 'settings_not_created';
  end if;

  select * into v_brand from public.brand_profiles where workspace_id = p_workspace_id;
  if v_brand.id is null or v_brand.company_name is null or v_brand.description is null or v_brand.onboarding_completed_at is null then
    v_missing := v_missing || 'brand_dna_incomplete';
  end if;

  if v_settings.id is not null then
    if v_settings.allowed_weekdays is null or array_length(v_settings.allowed_weekdays, 1) is null then
      v_missing := v_missing || 'weekdays_not_set';
    end if;
    if v_settings.allowed_formats is null or array_length(v_settings.allowed_formats, 1) is null then
      v_missing := v_missing || 'formats_not_set';
    end if;
    if v_settings.max_posts_per_window is null or v_settings.max_posts_per_window <= 0 then
      v_missing := v_missing || 'frequency_not_set';
    end if;
  end if;

  select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id;
  select min(credit_cost) into v_min_cost from public.ai_operation_costs where generation_type in ('post_unico', 'carrossel');
  if v_balance is null or v_min_cost is null or v_balance < v_min_cost then
    v_missing := v_missing || 'insufficient_credits';
  end if;

  return jsonb_build_object('ready', array_length(v_missing, 1) is null, 'missing', to_jsonb(v_missing));
end;
$function$;

revoke all on function public.check_pilot_activation_readiness(uuid) from public, anon;
grant execute on function public.check_pilot_activation_readiness(uuid) to authenticated;

create or replace function public.activate_pilot(p_workspace_id uuid)
returns public.pilot_settings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_readiness jsonb;
  v_row public.pilot_settings;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode ativar o Piloto.';
  end if;

  v_readiness := public.check_pilot_activation_readiness(p_workspace_id);
  if not (v_readiness ->> 'ready')::boolean then
    raise exception 'Configuração incompleta para ativar o Piloto: %', v_readiness -> 'missing';
  end if;

  update public.pilot_settings set status = 'active', updated_at = now() where workspace_id = p_workspace_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Configure o Piloto antes de ativar.';
  end if;

  perform public.log_audit_event(p_workspace_id, 'pilot_activated', 'pilot_settings', v_row.id, '{}'::jsonb);
  return v_row;
end;
$function$;

revoke all on function public.activate_pilot(uuid) from public, anon;
grant execute on function public.activate_pilot(uuid) to authenticated;

create or replace function public.pause_pilot(p_workspace_id uuid)
returns public.pilot_settings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.pilot_settings;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode pausar o Piloto.';
  end if;
  update public.pilot_settings set status = 'paused', updated_at = now() where workspace_id = p_workspace_id and status = 'active' returning * into v_row;
  if v_row.id is null then
    raise exception 'Piloto não está ativo.';
  end if;
  perform public.log_audit_event(p_workspace_id, 'pilot_paused', 'pilot_settings', v_row.id, '{}'::jsonb);
  return v_row;
end;
$function$;

revoke all on function public.pause_pilot(uuid) from public, anon;
grant execute on function public.pause_pilot(uuid) to authenticated;

create or replace function public.resume_pilot(p_workspace_id uuid)
returns public.pilot_settings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.pilot_settings;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode reativar o Piloto.';
  end if;
  update public.pilot_settings set status = 'active', updated_at = now() where workspace_id = p_workspace_id and status = 'paused' returning * into v_row;
  if v_row.id is null then
    raise exception 'Piloto não está pausado.';
  end if;
  perform public.log_audit_event(p_workspace_id, 'pilot_activated', 'pilot_settings', v_row.id, jsonb_build_object('resumed_from_pause', true));
  return v_row;
end;
$function$;

revoke all on function public.resume_pilot(uuid) from public, anon;
grant execute on function public.resume_pilot(uuid) to authenticated;

create or replace function public.disable_pilot(p_workspace_id uuid)
returns public.pilot_settings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.pilot_settings;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode desativar o Piloto.';
  end if;
  update public.pilot_settings set status = 'disabled', updated_at = now() where workspace_id = p_workspace_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Piloto não configurado.';
  end if;
  perform public.log_audit_event(p_workspace_id, 'pilot_paused', 'pilot_settings', v_row.id, jsonb_build_object('disabled', true));
  return v_row;
end;
$function$;

revoke all on function public.disable_pilot(uuid) from public, anon;
grant execute on function public.disable_pilot(uuid) to authenticated;

-- ═══════════════════ CONFLITO DE SLOT (ajuste 4) ═══════════════════
-- Considera TODO o sistema: contents.scheduled_at (manual OU já gerado
-- pelo Piloto anteriormente) + pilot_plan_items de QUALQUER plano ativo
-- do workspace — não só o plano corrente. Chamado na montagem do plano
-- E de novo imediatamente antes de gerar (revalidação).
create or replace function public.pilot_check_slot_conflict(p_workspace_id uuid, p_scheduled_for timestamptz, p_exclude_plan_item_id uuid default null)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select exists (
    select 1 from public.contents c
    where c.workspace_id = p_workspace_id and c.deleted_at is null and c.scheduled_at = p_scheduled_for
  ) or exists (
    select 1 from public.pilot_plan_items pi
    where pi.workspace_id = p_workspace_id and pi.scheduled_for = p_scheduled_for
      and pi.status not in ('skipped', 'failed')
      and (p_exclude_plan_item_id is null or pi.id <> p_exclude_plan_item_id)
  );
$function$;

comment on function public.pilot_check_slot_conflict(uuid, timestamptz, uuid) is 'Conteúdo manual sempre vence: um slot já ocupado em contents (qualquer origem) ou em outro pilot_plan_item ativo nunca é reutilizado pelo Piloto (ajuste 4 da aprovação da Fase 9).';

revoke all on function public.pilot_check_slot_conflict(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.pilot_check_slot_conflict(uuid, timestamptz, uuid) to authenticated, service_role;

-- ═══════════════════ PLANO: claim / finalize / approve / cancel ═══════════════════
-- Ajuste 3: idempotência forte da janela rolante. pg_advisory_xact_lock
-- serializa qualquer tentativa concorrente para o MESMO workspace
-- (cron duplicado, clique duplo via Edge Function, etc.) — combinado com
-- o índice único parcial (pilot_plans_one_active_per_workspace_idx),
-- garante uma única geração lógica em andamento por workspace, mesmo
-- que period_start calculado difira entre tentativas.
create or replace function public.claim_pilot_workspace_for_planning(p_workspace_id uuid, p_period_start date, p_period_end date)
returns public.pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_mode public.pilot_mode;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  if exists (
    select 1 from public.pilot_plans
    where workspace_id = p_workspace_id and status in ('draft', 'awaiting_approval', 'approved', 'generating')
  ) then
    raise exception 'Já existe um plano em andamento para este workspace.';
  end if;

  select mode into v_mode from public.pilot_settings where workspace_id = p_workspace_id;
  if v_mode is null then
    raise exception 'Piloto não configurado para este workspace.';
  end if;

  insert into public.pilot_plans (workspace_id, generation_key, period_start, period_end, mode, status)
  values (p_workspace_id, p_workspace_id::text || ':' || p_period_start::text, p_period_start, p_period_end, v_mode, 'draft')
  returning * into v_plan;

  perform public.log_audit_event(p_workspace_id, 'pilot_plan_generation_started', 'pilot_plans', v_plan.id,
    jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end));

  return v_plan;
end;
$function$;

revoke all on function public.claim_pilot_workspace_for_planning(uuid, date, date) from public, anon, authenticated;
grant execute on function public.claim_pilot_workspace_for_planning(uuid, date, date) to service_role;

-- Chamado pelo planner (Edge Function) depois de persistir os itens
-- validados: assisted -> aguarda aprovação humana; semi_auto -> segue
-- direto (só o CONTEÚDO exige aprovação humana no semi_auto, não o plano).
create or replace function public.finalize_pilot_plan(p_plan_id uuid)
returns public.pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_next public.pilot_plan_status;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;

  v_next := case when v_plan.mode = 'semi_auto' then 'approved' else 'awaiting_approval' end;

  update public.pilot_plans set
    status = v_next,
    approved_at = case when v_next = 'approved' then now() else null end,
    updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  if v_next = 'approved' then
    update public.pilot_plan_items set status = 'approved', updated_at = now()
    where pilot_plan_id = p_plan_id and status = 'planned';
  end if;

  perform public.log_audit_event(v_plan.workspace_id, 'pilot_plan_generated', 'pilot_plans', v_plan.id, jsonb_build_object('status', v_next));
  return v_plan;
end;
$function$;

revoke all on function public.finalize_pilot_plan(uuid) from public, anon, authenticated;
grant execute on function public.finalize_pilot_plan(uuid) to service_role;

-- Aprovação humana explícita do PLANO (modo assisted). approver também
-- pode aprovar plano, por decisão explícita da aprovação da Fase 9.
create or replace function public.approve_pilot_plan(p_plan_id uuid)
returns public.pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_plan public.pilot_plans;
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[]) then
    raise exception 'Sem permissão para aprovar este plano.';
  end if;
  if v_plan.status <> 'awaiting_approval' then
    raise exception 'Plano não está aguardando aprovação (status atual: %).', v_plan.status;
  end if;

  update public.pilot_plans set status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
  where id = p_plan_id returning * into v_plan;

  update public.pilot_plan_items set status = 'approved', updated_at = now()
  where pilot_plan_id = p_plan_id and status = 'planned';

  perform public.log_audit_event(v_plan.workspace_id, 'pilot_plan_approved', 'pilot_plans', v_plan.id, '{}'::jsonb);
  return v_plan;
end;
$function$;

revoke all on function public.approve_pilot_plan(uuid) from public, anon;
grant execute on function public.approve_pilot_plan(uuid) to authenticated;

-- item 45: regenerar preserva o plano anterior via cancel (nunca
-- sobrescreve silenciosamente) — chamar claim_pilot_workspace_for_planning
-- de novo depois disso cria o próximo, já que o índice único parcial só
-- bloqueia planos NÃO-terminais.
create or replace function public.cancel_pilot_plan(p_plan_id uuid, p_reason text default null)
returns public.pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if v_system_actor <> 'pilot_worker' and not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Sem permissão para cancelar este plano.';
  end if;
  if v_plan.status in ('completed', 'cancelled') then
    raise exception 'Plano já está em estado terminal (%).', v_plan.status;
  end if;

  update public.pilot_plans set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, updated_at = now()
  where id = p_plan_id returning * into v_plan;

  update public.pilot_plan_items set status = 'skipped', status_reason = coalesce(p_reason, 'plan_cancelled'), updated_at = now()
  where pilot_plan_id = p_plan_id and status not in ('generated', 'skipped', 'failed');

  perform public.log_audit_event(v_plan.workspace_id, 'pilot_plan_regenerated', 'pilot_plans', v_plan.id, jsonb_build_object('reason', p_reason));
  return v_plan;
end;
$function$;

revoke all on function public.cancel_pilot_plan(uuid, text) from public, anon;
grant execute on function public.cancel_pilot_plan(uuid, text) to authenticated, service_role;

-- ═══════════════════ ITENS DO PLANO ═══════════════════
create or replace function public.edit_pilot_plan_item(
  p_item_id uuid,
  p_scheduled_for timestamptz default null,
  p_topic text default null,
  p_angle text default null,
  p_format public.content_type default null,
  p_editorial_role public.pilot_editorial_role default null,
  p_brand_pillar text default null,
  p_objective text default null
)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.pilot_plan_items;
  v_settings public.pilot_settings;
  v_new_time timestamptz;
begin
  select * into v_item from public.pilot_plan_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Item não encontrado.';
  end if;
  if not public.has_workspace_role(v_item.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
    raise exception 'Sem permissão para editar este item.';
  end if;
  if v_item.status not in ('planned', 'approved') then
    raise exception 'Item já está em processamento/gerado e não pode mais ser editado (status: %).', v_item.status;
  end if;

  v_new_time := coalesce(p_scheduled_for, v_item.scheduled_for);
  if v_new_time <> v_item.scheduled_for and public.pilot_check_slot_conflict(v_item.workspace_id, v_new_time, v_item.id) then
    raise exception 'Já existe conteúdo ou item planejado neste horário.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = v_item.workspace_id;
  if p_format is not null and not (p_format = any(v_settings.allowed_formats)) then
    raise exception 'Formato % não está habilitado nas configurações do Piloto.', p_format;
  end if;

  update public.pilot_plan_items set
    scheduled_for = v_new_time,
    topic = coalesce(p_topic, topic),
    angle = coalesce(p_angle, angle),
    format = coalesce(p_format, format),
    editorial_role = coalesce(p_editorial_role, editorial_role),
    brand_pillar = coalesce(p_brand_pillar, brand_pillar),
    objective = coalesce(p_objective, objective),
    updated_at = now()
  where id = p_item_id
  returning * into v_item;

  perform public.log_audit_event(v_item.workspace_id, 'pilot_plan_item_edited', 'pilot_plan_items', v_item.id, '{}'::jsonb);
  return v_item;
end;
$function$;

revoke all on function public.edit_pilot_plan_item(uuid, timestamptz, text, text, public.content_type, public.pilot_editorial_role, text, text) from public, anon;
grant execute on function public.edit_pilot_plan_item(uuid, timestamptz, text, text, public.content_type, public.pilot_editorial_role, text, text) to authenticated;

-- item 47: remover do plano nunca apaga conteúdo já existente; se já
-- gerou, pede ação explícita em vez de destruir automaticamente.
create or replace function public.skip_pilot_plan_item(p_item_id uuid, p_reason text default null)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.pilot_plan_items;
begin
  select * into v_item from public.pilot_plan_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Item não encontrado.';
  end if;
  if not public.has_workspace_role(v_item.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
    raise exception 'Sem permissão para remover este item.';
  end if;
  if v_item.content_id is not null then
    raise exception 'Este item já gerou conteúdo — gerencie o conteúdo diretamente em Meu Conteúdo.';
  end if;
  if v_item.status not in ('planned', 'approved') then
    raise exception 'Item não pode mais ser removido (status: %).', v_item.status;
  end if;

  update public.pilot_plan_items set status = 'skipped', status_reason = coalesce(p_reason, 'user_removed'), updated_at = now()
  where id = p_item_id returning * into v_item;

  perform public.log_audit_event(v_item.workspace_id, 'pilot_plan_item_skipped', 'pilot_plan_items', v_item.id, jsonb_build_object('reason', p_reason));
  return v_item;
end;
$function$;

revoke all on function public.skip_pilot_plan_item(uuid, text) from public, anon;
grant execute on function public.skip_pilot_plan_item(uuid, text) to authenticated;

-- item 48: item adicionado manualmente pelo usuário continua sendo um
-- pilot_plan_item, mas com source='manual'.
create or replace function public.add_pilot_plan_item(
  p_plan_id uuid,
  p_scheduled_for timestamptz,
  p_topic text,
  p_format public.content_type,
  p_editorial_role public.pilot_editorial_role,
  p_brand_pillar text default null,
  p_objective text default null,
  p_angle text default null
)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_settings public.pilot_settings;
  v_item public.pilot_plan_items;
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
    raise exception 'Sem permissão para adicionar item a este plano.';
  end if;
  if v_plan.status in ('completed', 'cancelled') then
    raise exception 'Plano em estado terminal, não pode receber novos itens.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = v_plan.workspace_id;
  if not (p_format = any(v_settings.allowed_formats)) then
    raise exception 'Formato % não está habilitado nas configurações do Piloto.', p_format;
  end if;
  if public.pilot_check_slot_conflict(v_plan.workspace_id, p_scheduled_for, null) then
    raise exception 'Já existe conteúdo ou item planejado neste horário.';
  end if;

  insert into public.pilot_plan_items (
    pilot_plan_id, workspace_id, scheduled_for, editorial_role, brand_pillar, objective, format, topic, angle,
    reason, status, source
  ) values (
    p_plan_id, v_plan.workspace_id, p_scheduled_for, p_editorial_role, p_brand_pillar, p_objective, p_format, p_topic, p_angle,
    'Adicionado manualmente pelo usuário.',
    case when v_plan.status = 'approved' then 'approved' else 'planned' end,
    'manual'
  )
  returning * into v_item;

  perform public.log_audit_event(v_plan.workspace_id, 'pilot_plan_item_added', 'pilot_plan_items', v_item.id, '{}'::jsonb);
  return v_item;
end;
$function$;

revoke all on function public.add_pilot_plan_item(uuid, timestamptz, text, public.content_type, public.pilot_editorial_role, text, text, text) from public, anon;
grant execute on function public.add_pilot_plan_item(uuid, timestamptz, text, public.content_type, public.pilot_editorial_role, text, text, text) to authenticated;

-- ═══════════════════ CRÉDITOS (ajustes 2 e 6) ═══════════════════
create or replace function public.pilot_estimate_batch_cost(p_plan_id uuid)
returns bigint
language sql
security definer
set search_path to 'public'
stable
as $function$
  select coalesce(sum(c.credit_cost), 0)
  from public.pilot_plan_items pi
  join public.ai_operation_costs c on c.generation_type = (case pi.format when 'post' then 'post_unico' when 'carrossel' then 'carrossel' end)::public.ai_generation_type
  where pi.pilot_plan_id = p_plan_id and pi.status = 'approved';
$function$;

comment on function public.pilot_estimate_batch_cost(uuid) is 'Custo total esperado dos itens aprovados ainda não gerados — calculado ANTES de iniciar o lote (ajuste 2: nunca gerar parcialmente sem antes saber o custo total).';

revoke all on function public.pilot_estimate_batch_cost(uuid) from public, anon;
grant execute on function public.pilot_estimate_batch_cost(uuid) to authenticated, service_role;

-- Combina saldo real da conta COM o orçamento por janela configurado
-- (ajuste 6) — o Piloto nunca pode gastar acima do menor dos dois.
create or replace function public.pilot_check_budget(p_workspace_id uuid, p_plan_id uuid, p_needed bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
stable
as $function$
declare
  v_balance bigint;
  v_max_window bigint;
  v_consumed_window bigint;
  v_window_remaining bigint;
  v_available bigint;
begin
  select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id;
  select max_credits_per_window into v_max_window from public.pilot_settings where workspace_id = p_workspace_id;

  select coalesce(sum(g.credit_cost), 0) into v_consumed_window
  from public.ai_generations g
  join public.contents c on c.id = g.content_id
  join public.pilot_plan_items pi on pi.id = c.pilot_plan_item_id
  where pi.pilot_plan_id = p_plan_id and g.status = 'success';

  if v_max_window is null then
    v_window_remaining := null;
    v_available := coalesce(v_balance, 0);
  else
    v_window_remaining := greatest(v_max_window - v_consumed_window, 0);
    v_available := least(coalesce(v_balance, 0), v_window_remaining);
  end if;

  return jsonb_build_object(
    'sufficient', v_available >= p_needed,
    'needed', p_needed,
    'balance', coalesce(v_balance, 0),
    'window_budget', v_max_window,
    'window_remaining', v_window_remaining,
    'available', v_available
  );
end;
$function$;

comment on function public.pilot_check_budget(uuid, uuid, bigint) is 'Ajuste 6: guard-rail financeiro real — disponível = menor entre saldo da conta e orçamento restante da janela (max_credits_per_window). Ajuste 2: se insuficiente para o lote inteiro, nenhum item é gerado (ver pilot-content-generate).';

revoke all on function public.pilot_check_budget(uuid, uuid, bigint) from public, anon;
grant execute on function public.pilot_check_budget(uuid, uuid, bigint) to authenticated, service_role;

-- ═══════════════════ GERAÇÃO ═══════════════════
create or replace function public.start_pilot_generation(p_plan_id uuid)
returns public.pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if v_system_actor <> 'pilot_worker' and not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Sem permissão para iniciar geração deste plano.';
  end if;
  if v_plan.status <> 'approved' then
    raise exception 'Plano precisa estar aprovado para gerar conteúdo (status atual: %).', v_plan.status;
  end if;

  update public.pilot_plans set status = 'generating', updated_at = now() where id = p_plan_id returning * into v_plan;
  return v_plan;
end;
$function$;

revoke all on function public.start_pilot_generation(uuid) from public, anon;
grant execute on function public.start_pilot_generation(uuid) to authenticated, service_role;

-- Reivindicação atômica de itens para gerar — mesmo padrão de
-- claim_instagram_publications (FOR UPDATE SKIP LOCKED).
create or replace function public.claim_pilot_plan_items_for_generation(p_plan_id uuid, p_limit integer default 20)
returns setof public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.pilot_plan_items;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);
  for v_row in
    update public.pilot_plan_items pi
    set status = 'generating', updated_at = now()
    from (
      select id from public.pilot_plan_items
      where pilot_plan_id = p_plan_id and status = 'approved'
      order by scheduled_for asc
      limit p_limit
      for update skip locked
    ) eligible
    where pi.id = eligible.id
    returning pi.*
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;

revoke all on function public.claim_pilot_plan_items_for_generation(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_pilot_plan_items_for_generation(uuid, integer) to service_role;

-- Resolve um item reivindicado ('generating') para seu destino final, e
-- fecha o plano (status='completed') quando não sobra nenhum item
-- pendente. p_outcome='skipped' cobre a revalidação de conflito de slot
-- imediatamente antes de gerar (ajuste 4) e a rejeição por novelty
-- ('recently_covered', item 67).
create or replace function public.resolve_pilot_plan_item(p_item_id uuid, p_outcome text, p_content_id uuid default null, p_reason text default null)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.pilot_plan_items;
begin
  if p_outcome not in ('generated', 'skipped', 'failed') then
    raise exception 'Outcome inválido: %', p_outcome;
  end if;
  perform set_config('posttou.system_actor', 'pilot_worker', true);

  update public.pilot_plan_items
  set status = p_outcome::public.pilot_plan_item_status,
      content_id = case when p_outcome = 'generated' then p_content_id else content_id end,
      status_reason = case when p_outcome <> 'generated' then p_reason else status_reason end,
      updated_at = now()
  where id = p_item_id and status = 'generating'
  returning * into v_item;

  if v_item.id is null then
    raise exception 'Item % não está em estado "generating".', p_item_id;
  end if;

  perform public.log_audit_event(
    v_item.workspace_id,
    case p_outcome when 'generated' then 'pilot_content_generated' when 'skipped' then 'pilot_plan_item_skipped' else 'pilot_run_failed' end,
    'pilot_plan_items', v_item.id,
    jsonb_build_object('content_id', p_content_id, 'reason', p_reason)
  );

  if not exists (select 1 from public.pilot_plan_items where pilot_plan_id = v_item.pilot_plan_id and status in ('approved', 'generating')) then
    update public.pilot_plans set status = 'completed', updated_at = now() where id = v_item.pilot_plan_id and status = 'generating';
  end if;

  return v_item;
end;
$function$;

revoke all on function public.resolve_pilot_plan_item(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_pilot_plan_item(uuid, text, uuid, text) to service_role;
