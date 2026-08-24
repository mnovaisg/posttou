
-- Novo worker system_actor para o recovery de imagens presas — mesma
-- lista de workers de sistema já usada por log_audit_event, apenas
-- adicionando 'ai_recovery_worker' (nenhuma outra mudança nesta função).
create or replace function public.log_audit_event(p_workspace_id uuid, p_action text, p_resource_type text, p_resource_id uuid default null::uuid, p_metadata jsonb default '{}'::jsonb)
returns audit_logs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log public.audit_logs;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if v_system_actor in ('instagram_publish_worker', 'radar_worker', 'pilot_worker', 'performance_worker', 'strategy_worker', 'ai_recovery_worker') then
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
