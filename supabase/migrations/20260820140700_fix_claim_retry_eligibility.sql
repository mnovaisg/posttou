-- Bug: após o primeiro claim, contents.status vira 'publicando' e
-- permanece assim durante todo o processamento (inclusive retries). A
-- condição de elegibilidade exigia c.status = 'agendado', que só é
-- verdade ANTES do primeiro claim — retries nunca eram reclamados de
-- novo. Corrige para aceitar ambos os estados.
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
        and c.status in ('agendado', 'publicando')
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
