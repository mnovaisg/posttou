-- Fase 9 — ajustes descobertos durante a implementação do worker de
-- geração: (1) link_radar_opportunity_content (Fase 8) também depende de
-- is_workspace_member(auth.uid()), que falha sob service_role — precisa
-- do mesmo bypass pilot_worker já usado em log_audit_event/
-- enforce_content_status_transition. (2) a transição rascunho->em_revisao
-- feita pelo pilot_worker precisa acontecer DENTRO de uma RPC que também
-- seta o marcador de sessão na mesma transação (mesmo motivo pelo qual
-- claim_instagram_publications faz a transição de contents dentro de si
-- mesma, não num UPDATE solto depois).

create or replace function public.link_radar_opportunity_content(p_opportunity_id uuid, p_content_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_opp public.radar_opportunities;
  v_content_workspace uuid;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  select * into v_opp from public.radar_opportunities where id = p_opportunity_id;
  if v_opp.id is null then
    raise exception 'Oportunidade não encontrada.';
  end if;
  if v_system_actor <> 'pilot_worker' and not public.is_workspace_member(v_opp.workspace_id) then
    raise exception 'Sem permissão para esta oportunidade.';
  end if;
  if v_opp.status = 'used' then
    raise exception 'Esta oportunidade já foi transformada em conteúdo anteriormente.';
  end if;

  select workspace_id into v_content_workspace from public.contents where id = p_content_id;
  if v_content_workspace is null or v_content_workspace <> v_opp.workspace_id then
    raise exception 'Conteúdo não pertence ao mesmo workspace da oportunidade.';
  end if;

  update public.radar_opportunities
  set status = 'used', used_content_id = p_content_id, updated_at = now()
  where id = p_opportunity_id;

  update public.contents set radar_opportunity_id = p_opportunity_id where id = p_content_id;

  perform public.log_audit_event(
    v_opp.workspace_id, 'radar_content_created', 'radar_opportunities', p_opportunity_id,
    jsonb_build_object('content_id', p_content_id, 'cluster_id', v_opp.cluster_id)
  );
end;
$function$;

grant execute on function public.link_radar_opportunity_content(uuid, uuid) to service_role;

-- pilot_worker só pode rascunho->em_revisao (já validado pelo trigger em
-- enforce_content_status_transition) — esta RPC é o único lugar que seta
-- o marcador e faz o UPDATE na mesma transação.
create or replace function public.pilot_submit_content_for_review(p_content_id uuid)
returns public.contents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_content public.contents;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);
  update public.contents set status = 'em_revisao'
  where id = p_content_id and status = 'rascunho'
  returning * into v_content;

  if v_content.id is null then
    raise exception 'Conteúdo % não está em rascunho (não pode ser enviado à revisão pelo Piloto).', p_content_id;
  end if;

  return v_content;
end;
$function$;

comment on function public.pilot_submit_content_for_review(uuid) is 'Único caminho pelo qual o Piloto move um conteúdo para revisão — nunca aprova/agenda/publica (enforce_content_status_transition só permite pilot_worker fazer exatamente esta transição).';

revoke all on function public.pilot_submit_content_for_review(uuid) from public, anon, authenticated;
grant execute on function public.pilot_submit_content_for_review(uuid) to service_role;
