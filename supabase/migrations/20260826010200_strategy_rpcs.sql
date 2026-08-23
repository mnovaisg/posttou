-- Fase 11 — RPCs de aplicação/rollback (optimistic lock — padrão novo
-- neste projeto, ver auditoria) e ciclo de vida de experimentos.
-- Nenhuma dessas RPCs é chamada por LLM; toda validação de allowlist,
-- amostra e estado vive aqui, nunca no frontend.

alter table public.strategy_recommendations
  add column reverted_at timestamptz,
  add column reverted_by uuid references public.profiles(id);

-- ── Aplicação: backend é autoridade (item 14 do plano). Relê o valor
-- ATUAL de pilot_settings e só aplica se bater com o "before" congelado
-- na recomendação — senão marca stale, nunca sobrescreve silenciosamente. ──
create or replace function public.apply_strategy_recommendation(p_recommendation_id uuid)
returns public.strategy_recommendations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rec public.strategy_recommendations;
  v_settings public.pilot_settings;
  v_current jsonb;
  v_stale boolean := false;
begin
  select * into v_rec from public.strategy_recommendations where id = p_recommendation_id;
  if v_rec.id is null then
    raise exception 'Recomendação não encontrada.';
  end if;
  if not public.has_workspace_role(v_rec.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode aplicar uma recomendação ao Piloto.';
  end if;
  if v_rec.recommendation_type <> 'settings_change' then
    raise exception 'Esta recomendação não é uma alteração de configuração aplicável diretamente (tipo: %).', v_rec.recommendation_type;
  end if;
  if v_rec.status <> 'proposed' then
    raise exception 'Recomendação não está mais disponível (status atual: %).', v_rec.status;
  end if;
  if v_rec.expires_at <= now() then
    update public.strategy_recommendations set status = 'expired', status_reason = 'expired_before_apply' where id = v_rec.id;
    raise exception 'recommendation_expired';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = v_rec.workspace_id for update;
  if v_settings.id is null then
    raise exception 'Piloto não configurado para este workspace.';
  end if;

  -- Allowlist explícita (item 12 do plano) — qualquer target fora daqui
  -- nunca deveria ter sido persistido, mas checamos de novo por defesa
  -- em profundidade.
  case v_rec.target
    when 'editorial_mix' then
      v_current := to_jsonb(v_settings.editorial_mix);
      if v_current is distinct from v_rec.before then
        v_stale := true;
      else
        update public.pilot_settings set editorial_mix = v_rec.after, updated_at = now() where id = v_settings.id;
      end if;
    when 'format_mix' then
      v_current := to_jsonb(v_settings.format_mix);
      if v_current is distinct from v_rec.before then
        v_stale := true;
      else
        -- Revalida contra allowed_formats ATUAL (pode ter mudado desde a criação da recomendação).
        if exists (
          select 1 from jsonb_object_keys(v_rec.after) k
          where k = 'reel' or not (k = any(v_settings.allowed_formats::text[]))
        ) then
          raise exception 'format_mix proposto não é mais compatível com os formatos permitidos atuais.';
        end if;
        update public.pilot_settings set format_mix = v_rec.after, updated_at = now() where id = v_settings.id;
      end if;
    when 'preferred_times' then
      v_current := v_settings.preferred_times;
      if v_current is distinct from v_rec.before then
        v_stale := true;
      else
        update public.pilot_settings set preferred_times = v_rec.after, updated_at = now() where id = v_settings.id;
      end if;
    when 'allowed_weekdays' then
      v_current := to_jsonb(v_settings.allowed_weekdays);
      if v_current is distinct from v_rec.before then
        v_stale := true;
      else
        update public.pilot_settings
        set allowed_weekdays = (select array_agg((value)::int) from jsonb_array_elements_text(v_rec.after) as value), updated_at = now()
        where id = v_settings.id;
      end if;
    when 'max_radar_per_window' then
      v_current := to_jsonb(v_settings.max_radar_per_window);
      if v_current is distinct from v_rec.before then
        v_stale := true;
      else
        if (v_rec.after #>> '{}')::int > v_settings.max_posts_per_window then
          raise exception 'max_radar_per_window proposto (%) excede max_posts_per_window atual (%).', v_rec.after, v_settings.max_posts_per_window;
        end if;
        update public.pilot_settings set max_radar_per_window = (v_rec.after #>> '{}')::int, updated_at = now() where id = v_settings.id;
      end if;
    else
      raise exception 'Target de recomendação inválido: %.', v_rec.target;
  end case;

  if v_stale then
    update public.strategy_recommendations set status = 'expired', status_reason = 'stale_settings_changed' where id = v_rec.id;
    raise exception 'recommendation_stale';
  end if;

  update public.strategy_recommendations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), applied_at = now(), applied_by = auth.uid()
  where id = v_rec.id
  returning * into v_rec;

  perform public.log_audit_event(v_rec.workspace_id, 'strategy_recommendation_accepted', 'strategy_recommendations', v_rec.id,
    jsonb_build_object('target', v_rec.target, 'before', v_rec.before, 'after', v_rec.after));

  return v_rec;
end;
$function$;

revoke all on function public.apply_strategy_recommendation(uuid) from public, anon;
grant execute on function public.apply_strategy_recommendation(uuid) to authenticated;

-- ── Rollback: simétrico, compara o valor ATUAL contra "after" — se o
-- usuário mudou manualmente depois de aplicar, nunca sobrescreve. ──
create or replace function public.revert_strategy_recommendation(p_recommendation_id uuid)
returns public.strategy_recommendations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rec public.strategy_recommendations;
  v_settings public.pilot_settings;
  v_current jsonb;
  v_stale boolean := false;
begin
  select * into v_rec from public.strategy_recommendations where id = p_recommendation_id;
  if v_rec.id is null then
    raise exception 'Recomendação não encontrada.';
  end if;
  if not public.has_workspace_role(v_rec.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode desfazer uma alteração do Piloto.';
  end if;
  if v_rec.status <> 'accepted' then
    raise exception 'Só é possível desfazer uma recomendação já aplicada (status atual: %).', v_rec.status;
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = v_rec.workspace_id for update;
  if v_settings.id is null then
    raise exception 'Piloto não configurado para este workspace.';
  end if;

  case v_rec.target
    when 'editorial_mix' then
      v_current := to_jsonb(v_settings.editorial_mix);
      if v_current is distinct from v_rec.after then v_stale := true;
      else update public.pilot_settings set editorial_mix = v_rec.before, updated_at = now() where id = v_settings.id;
      end if;
    when 'format_mix' then
      v_current := to_jsonb(v_settings.format_mix);
      if v_current is distinct from v_rec.after then v_stale := true;
      else update public.pilot_settings set format_mix = v_rec.before, updated_at = now() where id = v_settings.id;
      end if;
    when 'preferred_times' then
      v_current := v_settings.preferred_times;
      if v_current is distinct from v_rec.after then v_stale := true;
      else update public.pilot_settings set preferred_times = v_rec.before, updated_at = now() where id = v_settings.id;
      end if;
    when 'allowed_weekdays' then
      v_current := to_jsonb(v_settings.allowed_weekdays);
      if v_current is distinct from v_rec.after then v_stale := true;
      else
        update public.pilot_settings
        set allowed_weekdays = (select array_agg((value)::int) from jsonb_array_elements_text(v_rec.before) as value), updated_at = now()
        where id = v_settings.id;
      end if;
    when 'max_radar_per_window' then
      v_current := to_jsonb(v_settings.max_radar_per_window);
      if v_current is distinct from v_rec.after then v_stale := true;
      else update public.pilot_settings set max_radar_per_window = (v_rec.before #>> '{}')::int, updated_at = now() where id = v_settings.id;
      end if;
    else
      raise exception 'Target de recomendação inválido: %.', v_rec.target;
  end case;

  if v_stale then
    raise exception 'rollback_stale';
  end if;

  update public.strategy_recommendations
  set status = 'reverted', reverted_at = now(), reverted_by = auth.uid()
  where id = v_rec.id
  returning * into v_rec;

  perform public.log_audit_event(v_rec.workspace_id, 'strategy_recommendation_reverted', 'strategy_recommendations', v_rec.id,
    jsonb_build_object('target', v_rec.target, 'restored', v_rec.before));

  return v_rec;
end;
$function$;

revoke all on function public.revert_strategy_recommendation(uuid) from public, anon;
grant execute on function public.revert_strategy_recommendation(uuid) to authenticated;

-- ── Dismiss: qualquer papel de escrita pode dispensar (não é mutação
-- permanente do Piloto, só descarta a sugestão). ──
create or replace function public.dismiss_strategy_recommendation(p_recommendation_id uuid, p_reason text default null)
returns public.strategy_recommendations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rec public.strategy_recommendations;
begin
  select * into v_rec from public.strategy_recommendations where id = p_recommendation_id;
  if v_rec.id is null then
    raise exception 'Recomendação não encontrada.';
  end if;
  if not public.has_workspace_role(v_rec.workspace_id, array['owner', 'admin', 'editor', 'approver']::public.workspace_role[]) then
    raise exception 'Sem permissão para dispensar esta recomendação.';
  end if;
  if v_rec.status <> 'proposed' then
    raise exception 'Recomendação não está mais ativa (status atual: %).', v_rec.status;
  end if;

  update public.strategy_recommendations
  set status = 'dismissed', dismissed_at = now(), dismissed_by = auth.uid(), dismiss_reason = p_reason
  where id = v_rec.id
  returning * into v_rec;

  perform public.log_audit_event(v_rec.workspace_id, 'strategy_recommendation_dismissed', 'strategy_recommendations', v_rec.id, jsonb_build_object('reason', p_reason));

  return v_rec;
end;
$function$;

revoke all on function public.dismiss_strategy_recommendation(uuid, text) from public, anon;
grant execute on function public.dismiss_strategy_recommendation(uuid, text) to authenticated;

-- ── Experimentos ──────────────────────────────────────────────────────
-- Congela baseline usando os últimos conteúdos maduros e comparáveis
-- (mesma dimensão/variante) já existentes — nunca recalculado depois.
create or replace function public.start_strategy_experiment(
  p_workspace_id uuid,
  p_hypothesis text,
  p_dimension text,
  p_variant jsonb,
  p_period_days integer default 14,
  p_target_sample_size integer default 2,
  p_success_threshold_pct numeric default 15,
  p_recommendation_id uuid default null
)
returns public.strategy_experiments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_experiment public.strategy_experiments;
  v_baseline_value numeric;
  v_baseline_n integer;
  v_editorial_role text := p_variant ->> 'editorial_role';
  v_format text := p_variant ->> 'format';
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[]) then
    raise exception 'Sem permissão para iniciar um experimento.';
  end if;
  if p_dimension not in ('editorial_role', 'format', 'origin') then
    raise exception 'Dimensão de experimento inválida: %.', p_dimension;
  end if;
  if p_target_sample_size < 1 or p_target_sample_size > 20 then
    raise exception 'target_sample_size precisa estar entre 1 e 20.';
  end if;

  -- Item 24: no máximo 1 experimento não-terminal por workspace. Lock
  -- consultivo por workspace evita corrida entre duas chamadas
  -- concorrentes (mesmo padrão de claim_pilot_workspace_for_planning).
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  if exists (select 1 from public.strategy_experiments where workspace_id = p_workspace_id and status in ('draft', 'active')) then
    raise exception 'Já existe um experimento ativo neste workspace. Conclua ou cancele antes de iniciar outro.';
  end if;

  -- Baseline congelado: score médio dos últimos 10 conteúdos maduros
  -- (consolidated) comparáveis à variante pedida.
  select round(avg(cs.score)::numeric, 1), count(*)
  into v_baseline_value, v_baseline_n
  from (
    select cs.score
    from public.content_performance_scores cs
    join public.contents c on c.id = cs.content_id
    left join public.pilot_plan_items ppi on ppi.id = c.pilot_plan_item_id
    where cs.workspace_id = p_workspace_id
      and cs.maturity_stage = 'consolidated'
      and cs.score is not null
      and (v_editorial_role is null or ppi.editorial_role::text = v_editorial_role)
      and (v_format is null or cs.format::text = v_format)
    order by cs.computed_at desc
    limit 10
  ) cs;

  v_experiment.id := gen_random_uuid();
  insert into public.strategy_experiments (
    id, workspace_id, recommendation_id, hypothesis, dimension, variant,
    period_start, period_end, target_sample_size,
    baseline_definition, success_criteria, status, started_at, created_by
  ) values (
    v_experiment.id, p_workspace_id, p_recommendation_id, p_hypothesis, p_dimension, p_variant,
    current_date, current_date + p_period_days, p_target_sample_size,
    jsonb_build_object('method', 'avg_score_last_10_consolidated', 'dimension', p_dimension, 'variant', p_variant, 'value', v_baseline_value, 'n_used', coalesce(v_baseline_n, 0)),
    jsonb_build_object('metric', 'avg_relative_score', 'operator', 'gte', 'threshold_pct', p_success_threshold_pct),
    'active', now(), auth.uid()
  )
  returning * into v_experiment;

  perform public.log_audit_event(p_workspace_id, 'strategy_experiment_started', 'strategy_experiments', v_experiment.id,
    jsonb_build_object('hypothesis', p_hypothesis, 'dimension', p_dimension, 'variant', p_variant, 'baseline', v_experiment.baseline_definition));

  return v_experiment;
end;
$function$;

revoke all on function public.start_strategy_experiment(uuid, text, text, jsonb, integer, integer, numeric, uuid) from public, anon;
grant execute on function public.start_strategy_experiment(uuid, text, text, jsonb, integer, integer, numeric, uuid) to authenticated;

create or replace function public.cancel_strategy_experiment(p_experiment_id uuid, p_reason text default null)
returns public.strategy_experiments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_exp public.strategy_experiments;
begin
  select * into v_exp from public.strategy_experiments where id = p_experiment_id;
  if v_exp.id is null then
    raise exception 'Experimento não encontrado.';
  end if;
  if not public.has_workspace_role(v_exp.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode cancelar um experimento.';
  end if;
  if v_exp.status not in ('draft', 'active') then
    raise exception 'Experimento não está mais ativo (status atual: %).', v_exp.status;
  end if;

  update public.strategy_experiments set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = v_exp.id
  returning * into v_exp;

  perform public.log_audit_event(v_exp.workspace_id, 'strategy_experiment_cancelled', 'strategy_experiments', v_exp.id, jsonb_build_object('reason', p_reason));

  return v_exp;
end;
$function$;

revoke all on function public.cancel_strategy_experiment(uuid, text) from public, anon;
grant execute on function public.cancel_strategy_experiment(uuid, text) to authenticated;

-- ── Avalia progresso/conclusão de um experimento ativo. Chamada pelo
-- gerador diário de recomendações (item 62: sem cron próprio) e também
-- exposta a authenticated para permitir refresh manual na UI. ──
create or replace function public.compute_experiment_result(p_experiment_id uuid)
returns public.strategy_experiments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exp public.strategy_experiments;
  v_actual_n integer;
  v_variant_value numeric;
  v_baseline_value numeric;
  v_delta_pct numeric;
  v_threshold numeric;
  v_meets boolean;
  v_confidence public.performance_confidence;
  v_cfg record;
begin
  select * into v_exp from public.strategy_experiments where id = p_experiment_id for update;
  if v_exp.id is null then
    raise exception 'Experimento não encontrado.';
  end if;
  if auth.uid() is not null and not public.is_workspace_member(v_exp.workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;
  if v_exp.status <> 'active' then
    return v_exp;
  end if;

  select count(*), round(avg(cs.score)::numeric, 1)
  into v_actual_n, v_variant_value
  from public.pilot_plan_items ppi
  join public.contents c on c.id = ppi.content_id
  join public.content_performance_scores cs on cs.content_id = c.id
  where ppi.experiment_id = v_exp.id
    and cs.maturity_stage = 'consolidated'
    and cs.score is not null;

  update public.strategy_experiments set actual_sample_size = coalesce(v_actual_n, 0), updated_at = now() where id = v_exp.id;

  -- Item 30/31: nunca conclui com amostra madura insuficiente — fica
  -- 'active' aguardando, por mais tempo que já tenha se passado.
  if coalesce(v_actual_n, 0) < v_exp.target_sample_size then
    select * into v_exp from public.strategy_experiments where id = p_experiment_id;
    return v_exp;
  end if;

  select * into v_cfg from public.performance_scoring_config where workspace_id = v_exp.workspace_id;
  if v_cfg.id is null then select * into v_cfg from public.performance_scoring_config where workspace_id is null; end if;

  v_baseline_value := (v_exp.baseline_definition ->> 'value')::numeric;
  v_threshold := (v_exp.success_criteria ->> 'threshold_pct')::numeric;

  -- Item 32: amostra insuficiente ou baseline sem dado -> inconclusive,
  -- nunca força "ganhou"/"perdeu".
  if v_baseline_value is null or v_actual_n < v_cfg.min_sample_provisional then
    update public.strategy_experiments
    set status = 'inconclusive', completed_at = now(),
        result = jsonb_build_object('reason', case when v_baseline_value is null then 'no_baseline_data' else 'insufficient_mature_sample' end, 'actual_sample_size', v_actual_n),
        confidence = 'low', updated_at = now()
    where id = v_exp.id
    returning * into v_exp;
  else
    v_delta_pct := round(((v_variant_value - v_baseline_value) / greatest(v_baseline_value, 1)) * 100, 1);
    v_meets := v_delta_pct >= v_threshold;
    v_confidence := case when v_actual_n >= v_cfg.min_sample_ready then 'high' when v_actual_n >= v_cfg.min_sample_provisional then 'medium' else 'low' end;

    update public.strategy_experiments
    set status = 'completed', completed_at = now(), confidence = v_confidence,
        result = jsonb_build_object(
          'variant_value', v_variant_value, 'baseline_value', v_baseline_value,
          'delta_pct', v_delta_pct, 'meets_success_criteria', v_meets, 'actual_sample_size', v_actual_n
        ),
        updated_at = now()
    where id = v_exp.id
    returning * into v_exp;
  end if;

  perform public.log_audit_event(v_exp.workspace_id, 'strategy_experiment_completed', 'strategy_experiments', v_exp.id, coalesce(v_exp.result, '{}'::jsonb));

  return v_exp;
end;
$function$;

revoke all on function public.compute_experiment_result(uuid) from public, anon;
grant execute on function public.compute_experiment_result(uuid) to authenticated, service_role;
