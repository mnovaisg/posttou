-- Fase 11 — correção encontrada durante os testes reais: compute_experiment_result
-- é chamada tanto por usuário autenticado (refresh manual na UI) quanto pelo
-- cron do gerador de recomendações (service_role, sem JWT de usuário — auth.uid()
-- é null). log_audit_event exige is_workspace_member(auth.uid()) OU o marcador
-- posttou.system_actor — faltava adicionar 'strategy_worker' à lista aceita e
-- setar o marcador quando a chamada vem do worker (auth.uid() null).
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
  if v_system_actor in ('instagram_publish_worker', 'radar_worker', 'pilot_worker', 'performance_worker', 'strategy_worker') then
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
  -- Chamada tanto pelo cron (service_role, sem auth.uid()) quanto por um
  -- usuário autenticado (refresh manual) — só marca actor de sistema
  -- quando não há usuário real, pra nunca mascarar quem pediu o refresh.
  if auth.uid() is null then
    perform set_config('posttou.system_actor', 'strategy_worker', true);
  end if;

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

  if coalesce(v_actual_n, 0) < v_exp.target_sample_size then
    select * into v_exp from public.strategy_experiments where id = p_experiment_id;
    return v_exp;
  end if;

  select * into v_cfg from public.performance_scoring_config where workspace_id = v_exp.workspace_id;
  if v_cfg.id is null then select * into v_cfg from public.performance_scoring_config where workspace_id is null; end if;

  v_baseline_value := (v_exp.baseline_definition ->> 'value')::numeric;
  v_threshold := (v_exp.success_criteria ->> 'threshold_pct')::numeric;

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
