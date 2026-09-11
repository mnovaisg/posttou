-- Permite publicar/agendar direto de 'rascunho' (pulando em_revisao/aprovado)
-- quando o workspace desativa a exigência de aprovação. Consolida o
-- conceito de "aprovação obrigatória" numa única flag por workspace —
-- pilot_settings.always_require_approval é específico do Piloto
-- Automático (feature separada, hoje só um stub que nunca publica
-- sozinho) e não é tocado aqui, para não arriscar regressão nele.
alter table public.workspaces
  add column require_content_approval boolean not null default true;

comment on column public.workspaces.require_content_approval is
  'Quando true (padrão, preserva o comportamento existente): todo conteúdo passa por rascunho->em_revisao->aprovado antes de poder ser agendado/publicado. Quando false: owner/admin/editor pode agendar/publicar direto de rascunho.';

-- Novo destino de retorno do OAuth do Instagram: volta para a tela
-- "post pronto" do conteúdo específico que o usuário estava tentando
-- publicar quando percebeu que não tinha Instagram conectado.
alter type public.instagram_oauth_return_to add value 'content_ready';

alter table public.instagram_oauth_states
  add column content_id uuid references public.contents(id);

create or replace function public.enforce_content_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed boolean := false;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if old.deleted_at is not null then
    raise exception 'Conteúdo excluído não pode ser alterado.';
  end if;

  if new.status = old.status then
    if v_system_actor in ('instagram_publish_worker', 'pilot_worker') then
      return new;
    end if;
    if not public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
      raise exception 'Sem permissão para editar este conteúdo.';
    end if;
    return new;
  end if;

  if v_system_actor = 'instagram_publish_worker' then
    allowed := (old.status = 'agendado' and new.status = 'publicando')
      or (old.status = 'publicando' and new.status in ('publicado', 'falhou'));
    if not allowed then
      raise exception 'Transição de status inválida para o worker de publicação: % -> %', old.status, new.status;
    end if;
    return new;
  end if;

  if v_system_actor = 'pilot_worker' then
    allowed := (old.status = 'rascunho' and new.status = 'em_revisao');
    if not allowed then
      raise exception 'Transição de status inválida para o worker do Piloto: % -> % (pilot_worker só pode rascunho->em_revisao, nunca aprova/agenda/publica)', old.status, new.status;
    end if;
    return new;
  end if;

  allowed := case
    when old.status = 'rascunho' and new.status = 'em_revisao' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'aprovado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'rejeitado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'rascunho' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor', 'approver']::public.workspace_role[])
    when old.status = 'rejeitado' and new.status in ('rascunho', 'em_revisao') then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'aprovado' and new.status = 'agendado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
      and new.scheduled_at is not null
    when old.status = 'aprovado' and new.status = 'rascunho' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin']::public.workspace_role[])
    when old.status = 'agendado' and new.status = 'aprovado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'falhou' and new.status in ('agendado', 'rascunho') then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    -- Publicação direta: só quando o workspace desativou explicitamente a
    -- exigência de aprovação (require_content_approval = false) — nunca
    -- inferido por tamanho de equipe. Mesmo papel exigido de
    -- aprovado->agendado, para manter a mesma régua de permissão.
    when old.status = 'rascunho' and new.status = 'agendado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
      and new.scheduled_at is not null
      and not coalesce((select w.require_content_approval from public.workspaces w where w.id = new.workspace_id), true)
    else false
  end;

  if not allowed then
    raise exception 'Transição de status inválida: % -> % (papel insuficiente ou transição incoerente)', old.status, new.status;
  end if;

  if new.status = 'rejeitado' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'É necessário informar um motivo para rejeitar o conteúdo.';
  end if;

  if new.status <> 'rejeitado' then
    new.rejection_reason := null;
  end if;

  if old.status = 'agendado' and new.status = 'aprovado' then
    new.scheduled_at := null;
  end if;

  return new;
end;
$function$;

-- RPC dedicado para o toggle de aprovação — só owner/admin, com audit log.
create or replace function public.update_workspace_approval_setting(p_workspace_id uuid, p_require_approval boolean)
 RETURNS public.workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace public.workspaces;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode alterar a exigência de aprovação.';
  end if;

  update public.workspaces
  set require_content_approval = p_require_approval
  where id = p_workspace_id
  returning * into v_workspace;

  if not found then
    raise exception 'Workspace não encontrado.';
  end if;

  perform public.log_audit_event(p_workspace_id, 'workspace_approval_setting_updated', 'workspaces', p_workspace_id, jsonb_build_object('require_content_approval', p_require_approval));

  return v_workspace;
end;
$function$;

grant execute on function public.update_workspace_approval_setting(uuid, boolean) to authenticated;