
-- Bloco 5: o claim promove até 3 conteúdos-sugestão via service_role.
-- Mesmo bug já corrigido para pilot_worker/instagram workers: o trigger
-- de auditoria de INSERT em contents (audit_content_changes) chama
-- log_audit_event, que exige o marcador posttou.system_actor NA MESMA
-- transação do INSERT — set_config de uma chamada REST anterior não
-- persiste. RPC dedicada seta o marcador e insere (contents +
-- content_pages) na mesma função/transação.

create or replace function public.log_audit_event(
  p_workspace_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log public.audit_logs;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if v_system_actor in ('instagram_publish_worker', 'radar_worker', 'pilot_worker', 'performance_worker', 'strategy_worker', 'ai_recovery_worker', 'discovery_claim_worker') then
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

comment on function public.log_audit_event(uuid, text, text, uuid, jsonb) is
  'Registra evento de auditoria. Workers de background (service_role) identificados por posttou.system_actor pulam a checagem de membership (auth.uid() é null nesse contexto) — inclui discovery_claim_worker (Bloco 5: promoção de sugestões pré-cadastro no claim).';

create or replace function public.discovery_claim_create_content(
  p_workspace_id uuid,
  p_type public.content_type,
  p_format public.content_format,
  p_title text,
  p_caption text,
  p_created_by uuid,
  p_discovery_session_id uuid,
  p_page_width int,
  p_page_height int
)
returns public.contents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_content public.contents;
begin
  perform set_config('posttou.system_actor', 'discovery_claim_worker', true);

  insert into public.contents (workspace_id, type, format, title, origin, status, caption, created_by, discovery_session_id)
  values (p_workspace_id, p_type, p_format, p_title, 'ia', 'rascunho', p_caption, p_created_by, p_discovery_session_id)
  returning * into v_content;

  insert into public.content_pages (content_id, position, width, height)
  values (v_content.id, 0, p_page_width, p_page_height);

  return v_content;
end;
$function$;

comment on function public.discovery_claim_create_content(uuid, public.content_type, public.content_format, text, text, uuid, uuid, int, int) is
  'Bloco 5: cria 1 conteúdo-sugestão (origin=ia, status=rascunho) + 1 content_pages (sem imagem solicitada) a partir do claim de uma sessão de Discovery pré-cadastro. Seta posttou.system_actor=discovery_claim_worker para o trigger de auditoria não exigir membership do service_role. Chamada até 3x por claim, uma por preview — nunca gera conteúdo novo por IA.';
