-- Fase 7 — Publicação real. O worker de publicação (service_role, sem
-- auth.uid()) precisa fazer 3 transições em contents.status que hoje só
-- usuários autenticados com papel podem fazer (enforce_content_status_transition
-- depende de has_workspace_role/auth.uid()). Em vez de um bypass
-- genérico "service_role pode tudo", usamos um marcador LOCAL À
-- TRANSAÇÃO (set_config(..., true) — nunca escapa da transação que o
-- define) setado só dentro das 3 RPCs abaixo, e mesmo com o marcador
-- setado só as transições explícitas (agendado→publicando,
-- publicando→publicado, publicando→falhou) são permitidas — nunca
-- "allow everything". Nenhum UPDATE feito diretamente com a service
-- role key fora destas RPCs ativa o marcador.
create or replace function public.enforce_content_status_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  allowed boolean := false;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if old.deleted_at is not null then
    raise exception 'Conteúdo excluído não pode ser alterado.';
  end if;

  if new.status = old.status then
    if v_system_actor = 'instagram_publish_worker' then
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

comment on function public.enforce_content_status_transition() is 'Fase 3: máquina de estados de contents.status por papel. Fase 7: agendado->publicando->publicado|falhou só passam com o marcador local posttou.system_actor=instagram_publish_worker, setado exclusivamente pelas RPCs claim/complete/fail_instagram_publication — nunca por UPDATE direto.';

-- audit_content_changes: adiciona o rótulo de ação para 'publicando'
-- (as demais transições já eram cobertas). Nenhuma mudança de
-- comportamento para auth.uid() aqui — quem precisa do bypass é
-- log_audit_event, tratado abaixo.
create or replace function public.audit_content_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        when 'publicando' then 'content_publicando'
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
$function$;

-- log_audit_event: mesmo princípio do marcador local — só sob
-- posttou.system_actor='instagram_publish_worker' o check de
-- is_workspace_member(auth.uid()) é pulado (auth.uid() é null sob
-- service_role, então o check normal sempre falharia para o worker).
-- O evento é gravado com user_id=null (nenhum usuário humano agiu) e
-- metadata.actor marcando a origem — nunca atribuído a um usuário real.
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
  if v_system_actor = 'instagram_publish_worker' then
    insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
    values (p_workspace_id, null, p_action, p_resource_type, p_resource_id, p_metadata || jsonb_build_object('actor', 'instagram_publish_worker'))
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

-- ── RPC 1: claim atômico ─────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED garante que, mesmo com duas invocações
-- concorrentes do worker (cron sobreposto, retry manual, etc.), cada
-- linha elegível é reivindicada por no máximo uma delas.
create or replace function public.claim_instagram_publications(p_batch_limit integer default 5)
returns setof public.instagram_publications
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.instagram_publications;
begin
  perform set_config('posttou.system_actor', 'instagram_publish_worker', true);

  for v_row in
    update public.instagram_publications ip
    set status = 'processing',
        claimed_at = now(),
        last_attempt_at = now(),
        attempt_count = ip.attempt_count + 1,
        updated_at = now()
    from (
      select ip2.id
      from public.instagram_publications ip2
      join public.contents c on c.id = ip2.content_id
      where ip2.status = 'pending'
        and ip2.claimed_at is null
        and (ip2.next_retry_at is null or ip2.next_retry_at <= now())
        and c.status = 'agendado'
        and c.scheduled_at is not null
        and c.scheduled_at <= now()
        and c.deleted_at is null
      order by c.scheduled_at asc
      limit p_batch_limit
      for update of ip2 skip locked
    ) eligible
    where ip.id = eligible.id
    returning ip.*
  loop
    update public.contents set status = 'publicando' where id = v_row.content_id and status = 'agendado';
    perform public.log_audit_event(
      (select workspace_id from public.contents where id = v_row.content_id),
      'instagram_publish_processing', 'instagram_publications', v_row.id,
      jsonb_build_object('content_id', v_row.content_id, 'attempt_count', v_row.attempt_count)
    );
    return next v_row;
  end loop;
  return;
end;
$function$;

revoke all on function public.claim_instagram_publications(integer) from public, anon, authenticated;
grant execute on function public.claim_instagram_publications(integer) to service_role;

-- ── RPC 2: concluir com sucesso (só após confirmação real da Meta) ──
create or replace function public.complete_instagram_publication(
  p_publication_id uuid,
  p_ig_media_id text,
  p_permalink text default null
)
returns public.instagram_publications
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.instagram_publications;
begin
  perform set_config('posttou.system_actor', 'instagram_publish_worker', true);

  update public.instagram_publications
  set status = 'published', ig_media_id = p_ig_media_id, permalink = p_permalink, published_at = now(), updated_at = now()
  where id = p_publication_id
    and status in ('processing', 'container_created', 'publishing')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Publicação % não está num estado válido para ser concluída (já concluída, cancelada, ou não reivindicada).', p_publication_id;
  end if;

  update public.contents set status = 'publicado', published_at = now() where id = v_row.content_id and status = 'publicando';

  perform public.log_audit_event(
    (select workspace_id from public.contents where id = v_row.content_id),
    'instagram_publish_completed', 'instagram_publications', v_row.id,
    jsonb_build_object('content_id', v_row.content_id, 'ig_media_id', p_ig_media_id, 'permalink', p_permalink)
  );

  return v_row;
end;
$function$;

revoke all on function public.complete_instagram_publication(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_instagram_publication(uuid, text, text) to service_role;

-- ── RPC 3: registrar falha (terminal ou com retry agendado) ─────────
create or replace function public.fail_instagram_publication(
  p_publication_id uuid,
  p_error_code text,
  p_error_message text,
  p_terminal boolean,
  p_next_retry_at timestamptz default null
)
returns public.instagram_publications
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.instagram_publications;
begin
  perform set_config('posttou.system_actor', 'instagram_publish_worker', true);

  if p_terminal then
    update public.instagram_publications
    set status = 'failed', last_error_code = p_error_code, last_error_message = p_error_message, updated_at = now()
    where id = p_publication_id
      and status in ('processing', 'container_created', 'publishing')
    returning * into v_row;
  else
    update public.instagram_publications
    set status = 'pending', claimed_at = null,
        last_error_code = p_error_code, last_error_message = p_error_message,
        next_retry_at = coalesce(p_next_retry_at, now() + interval '1 minute'),
        updated_at = now()
    where id = p_publication_id
      and status in ('processing', 'container_created', 'publishing')
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'Publicação % não está num estado válido para registrar falha.', p_publication_id;
  end if;

  if p_terminal then
    update public.contents set status = 'falhou' where id = v_row.content_id and status = 'publicando';
  end if;

  perform public.log_audit_event(
    (select workspace_id from public.contents where id = v_row.content_id),
    case when p_terminal then 'instagram_publish_failed' else 'instagram_publish_retry_scheduled' end,
    'instagram_publications', v_row.id,
    jsonb_build_object('content_id', v_row.content_id, 'error_code', p_error_code, 'terminal', p_terminal, 'next_retry_at', p_next_retry_at)
  );

  return v_row;
end;
$function$;

revoke all on function public.fail_instagram_publication(uuid, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.fail_instagram_publication(uuid, text, text, boolean, timestamptz) to service_role;
