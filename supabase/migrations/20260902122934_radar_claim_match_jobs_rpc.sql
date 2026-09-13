
-- Claim atômico de um lote pequeno de jobs pendentes — FOR UPDATE SKIP
-- LOCKED garante que duas invocações do worker (cron sobreposto, ou
-- disparo manual + cron) nunca peguem o mesmo job. security definer
-- porque radar_match_jobs não tem policy de escrita (só service_role).
create or replace function public.radar_claim_match_jobs(p_batch_size int, p_lease_minutes int default 3)
returns setof public.radar_match_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  update public.radar_match_jobs
  set status = 'processing',
      claimed_at = now(),
      lease_expires_at = now() + make_interval(mins => p_lease_minutes),
      updated_at = now()
  where id in (
    select id from public.radar_match_jobs
    where status = 'pending'
    order by created_at asc
    limit p_batch_size
    for update skip locked
  )
  returning *;
end;
$function$;

grant execute on function public.radar_claim_match_jobs(int, int) to service_role;
revoke execute on function public.radar_claim_match_jobs(int, int) from authenticated, anon, public;

comment on function public.radar_claim_match_jobs(int, int) is
  'Hotfix pós-Bloco 9: reivindica atomicamente até p_batch_size jobs pendentes de radar_match_jobs (FOR UPDATE SKIP LOCKED). Marca como processing com lease de p_lease_minutes — se a invocação morrer antes de concluir, o job vence e volta a ficar elegível (ver reconciliação no worker). Só service_role executa.';
