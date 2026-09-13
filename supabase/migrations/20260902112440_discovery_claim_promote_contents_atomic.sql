
-- Bug real encontrado testando o Bloco 7.1: duas chamadas quase
-- simultâneas ao claim (mesmo usuário, 56ms de diferença — replay/duplo
-- disparo do hook no cliente) resultaram em 6 conteúdos promovidos em
-- vez de 3. A checagem "já existe algo com este discovery_session_id?"
-- feita em JS, seguida de um loop de 3 INSERTs via
-- discovery_claim_create_content, não é atômica: as duas chamadas
-- podem passar pela checagem antes de qualquer INSERT commitar.
--
-- Esta função substitui o loop por UMA transação só, com
-- pg_advisory_xact_lock por sessão (libera sozinho no fim da
-- transação/RPC) — a segunda chamada concorrente espera o lock, e ao
-- adquiri-lo já encontra os 3 conteúdos da primeira, então não insere
-- nada.
create or replace function public.discovery_claim_promote_contents(
  p_session_id uuid,
  p_workspace_id uuid,
  p_created_by uuid,
  p_previews jsonb
)
returns setof public.contents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_preview jsonb;
  v_content public.contents;
begin
  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  if exists (select 1 from public.contents where discovery_session_id = p_session_id) then
    return;
  end if;

  perform set_config('posttou.system_actor', 'discovery_claim_worker', true);

  for v_preview in select * from jsonb_array_elements(p_previews)
  loop
    insert into public.contents (workspace_id, type, format, title, origin, status, caption, created_by, discovery_session_id)
    values (
      p_workspace_id,
      (v_preview->>'type')::public.content_type,
      (v_preview->>'format')::public.content_format,
      v_preview->>'title',
      'ia',
      'rascunho',
      v_preview->>'caption',
      p_created_by,
      p_session_id
    )
    returning * into v_content;

    insert into public.content_pages (content_id, position, width, height)
    values (v_content.id, 0, (v_preview->>'page_width')::int, (v_preview->>'page_height')::int);

    return next v_content;
  end loop;

  return;
end;
$function$;

comment on function public.discovery_claim_promote_contents(uuid, uuid, uuid, jsonb) is
  'Bloco 7.1: promoção atômica das sugestões do claim (Bloco 5), corrigindo race condition real (2 chamadas quase simultâneas duplicavam para 6 contents). pg_advisory_xact_lock por sessão + checagem dentro da mesma transação — nunca promove duas vezes a mesma sessão mesmo sob concorrência. Só service_role executa.';

grant execute on function public.discovery_claim_promote_contents(uuid, uuid, uuid, jsonb) to service_role;
revoke execute on function public.discovery_claim_promote_contents(uuid, uuid, uuid, jsonb) from authenticated, anon, public;
