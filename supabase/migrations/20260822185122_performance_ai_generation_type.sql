-- Fase 10 — novo tipo de geração de IA para insights de performance
-- (ajuste 6/7: só usado no caminho MANUAL "Explicar melhor" — geração
-- automática de interpretação por IA não debita crédito e por isso não
-- necessariamente passa por ai_generations/consume_credits, mas quando
-- passar, usa este mesmo tipo, mantendo uma única trilha de auditoria de
-- IA em vez de uma paralela).
--
-- ALTER TYPE ... ADD VALUE fica isolado nesta migration (não pode ser
-- usado na mesma transação em que é adicionado, em versões do Postgres
-- anteriores à garantia plena do PG12+) — o uso do valor vem só na
-- próxima migration.
alter type public.ai_generation_type add value if not exists 'performance_insight';

-- log_audit_event: adiciona 'performance_worker' ao actor de sistema já
-- aceito (mesmo padrão de instagram_publish_worker/radar_worker/pilot_worker
-- — collector/scorer rodam sem auth.uid()).
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
  if v_system_actor in ('instagram_publish_worker', 'radar_worker', 'pilot_worker', 'performance_worker') then
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
