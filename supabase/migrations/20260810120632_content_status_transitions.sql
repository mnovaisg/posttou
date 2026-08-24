-- =========================================================
-- Máquina de estados do conteúdo, aplicada no banco.
--
-- Fluxo permitido:
--   rascunho    -> em_revisao
--   em_revisao  -> aprovado | rejeitado | rascunho (recall)
--   rejeitado   -> rascunho | em_revisao (reenviar)
--   aprovado    -> agendado | rascunho (owner/admin manda de volta)
--   agendado    -> aprovado (desagendar) | publicado | falhou (reservado ao futuro publish worker)
--   falhou      -> agendado | rascunho
--   publicado   -> (terminal — nunca volta sozinho para rascunho)
--
-- Edições de campos (sem mudança de status) exigem owner/admin/editor —
-- um approver só pode gravar a linha quando está de fato aprovando ou
-- rejeitando, nunca editando o conteúdo em si.
-- =========================================================
create or replace function public.enforce_content_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if old.deleted_at is not null then
    raise exception 'Conteúdo excluído não pode ser alterado.';
  end if;

  if new.status = old.status then
    -- Edição de campos sem transição de status: exige papel de editor+.
    if not public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
      raise exception 'Sem permissão para editar este conteúdo.';
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
    when old.status = 'agendado' and new.status in ('publicado', 'falhou') then
      -- Reservado ao worker de publicação (Fase 6/7). Nenhuma UI expõe isto na Fase 3.
      public.has_workspace_role(new.workspace_id, array['owner', 'admin']::public.workspace_role[])
    when old.status = 'falhou' and new.status in ('agendado', 'rascunho') then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
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
$$;

create trigger contents_enforce_status_transition
  before update on public.contents
  for each row execute function public.enforce_content_status_transition();

-- =========================================================
-- Auditoria e versionamento automáticos — não dependem do frontend
-- lembrar de chamar log_audit_event a cada mutação.
-- =========================================================
create or replace function public.audit_content_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.duplicated_from is not null then 'content_duplicado' else 'content_criado' end;
    perform public.log_audit_event(
      new.workspace_id, v_action, 'contents', new.id,
      jsonb_build_object('title', new.title, 'type', new.type, 'origin', new.origin, 'duplicated_from', new.duplicated_from)
    );
    return new;

  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      perform public.log_audit_event(
        new.workspace_id, 'content_excluido', 'contents', new.id,
        jsonb_build_object('title', new.title, 'status', new.status)
      );
      return new;
    end if;

    if new.status <> old.status then
      v_action := case new.status
        when 'em_revisao' then 'content_enviado_revisao'
        when 'aprovado' then 'content_aprovado'
        when 'rejeitado' then 'content_rejeitado'
        when 'agendado' then 'content_agendado'
        when 'publicado' then 'content_publicado'
        when 'falhou' then 'content_falhou'
        else 'content_status_alterado'
      end;
      perform public.log_audit_event(
        new.workspace_id, v_action, 'contents', new.id,
        jsonb_build_object('from', old.status, 'to', new.status, 'rejection_reason', new.rejection_reason, 'scheduled_at', new.scheduled_at)
      );
    else
      insert into public.content_versions (content_id, snapshot, created_by)
      values (new.id, to_jsonb(old), auth.uid());

      perform public.log_audit_event(
        new.workspace_id, 'content_editado', 'contents', new.id,
        jsonb_build_object('title', new.title)
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;

create trigger contents_audit_after
  after insert or update on public.contents
  for each row execute function public.audit_content_changes();
