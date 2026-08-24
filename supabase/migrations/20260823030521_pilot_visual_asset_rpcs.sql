-- Fase 13 — RPCs de bookkeeping da arte automática do Piloto + trigger de
-- propagação (ai_generations resolve -> content_pages reflete -> quando
-- TODAS as páginas do conteúdo estão em estado terminal, o conteúdo segue
-- pra revisão — item 11: pilot-content-generate nunca espera a imagem).

-- ── helper interna: confere se todas as páginas do conteúdo já estão em
-- estado terminal (ready/failed) e, se sim, envia o conteúdo pra revisão.
-- Chamada tanto pelo trigger de sucesso/falha assíncrona quanto pela falha
-- síncrona no kickoff (ex.: crédito insuficiente) — mesma régua nos dois
-- casos, sem duplicar a lógica de contagem. ──
create or replace function public._pilot_submit_content_if_visual_complete(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_content public.contents;
  v_pending_siblings integer;
begin
  select * into v_content from public.contents where id = p_content_id;
  if v_content.id is null or v_content.status <> 'rascunho' or v_content.origin <> 'autopilot' then
    return;
  end if;

  select count(*) into v_pending_siblings
  from public.content_pages
  where content_id = p_content_id and visual_asset_status in ('pending', 'generating');

  if v_pending_siblings = 0 then
    -- Defesa contra a corrida rara de 2 páginas do mesmo carrossel
    -- resolvendo quase simultaneamente: pilot_submit_content_for_review
    -- levanta exceção se o conteúdo não estiver mais em 'rascunho' (já
    -- submetido pela outra chamada) — isso NUNCA pode abortar a escrita
    -- em ai_generations que disparou este helper.
    begin
      perform public.pilot_submit_content_for_review(p_content_id);
    exception when others then
      null;
    end;
  end if;
end;
$function$;

revoke all on function public._pilot_submit_content_if_visual_complete(uuid) from public, anon, authenticated;

-- ── propagação: quando uma geração de imagem vinculada a uma página
-- resolve (sucesso/falha), reflete o estado nela e, se for a última
-- pendente do conteúdo, libera pra revisão. Não interfere em gerações que
-- não pertencem a nenhuma página (texto, Editor manual, DNA Visual). ──
create or replace function public.sync_content_page_visual_asset()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.content_pages;
  v_new_status public.content_visual_asset_status;
begin
  if new.status not in ('success', 'failed') or old.status is distinct from 'processing' then
    return new;
  end if;

  select * into v_page from public.content_pages where visual_ai_generation_id = new.id for update;
  if v_page.id is null then
    return new;
  end if;

  v_new_status := case when new.status = 'success' then 'ready' else 'failed' end;
  update public.content_pages set visual_asset_status = v_new_status, updated_at = now() where id = v_page.id;

  perform public._pilot_submit_content_if_visual_complete(v_page.content_id);

  return new;
end;
$function$;

drop trigger if exists ai_generations_sync_content_page_visual_asset on public.ai_generations;
create trigger ai_generations_sync_content_page_visual_asset
  after update on public.ai_generations
  for each row execute function public.sync_content_page_visual_asset();

-- ── bookkeeping chamado pelo worker (Edge Function) ao redor da chamada
-- real ao provider — nunca decide crédito/prompt, só o estado da página. ──
create or replace function public.pilot_mark_visual_asset_generating(p_page_id uuid, p_ai_generation_id uuid)
returns public.content_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_page public.content_pages;
begin
  update public.content_pages
  set visual_asset_status = 'generating', visual_ai_generation_id = p_ai_generation_id,
      visual_generation_attempts = visual_generation_attempts + 1, updated_at = now()
  where id = p_page_id
  returning * into v_page;

  if v_page.id is null then
    raise exception 'Página % não encontrada.', p_page_id;
  end if;

  return v_page;
end;
$function$;

revoke all on function public.pilot_mark_visual_asset_generating(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pilot_mark_visual_asset_generating(uuid, uuid) to service_role;

-- ── falha síncrona no kickoff (nunca chegou a virar 'processing' em
-- ai_generations, ex.: crédito insuficiente ou erro imediato do provider)
-- — usa a MESMA régua de "libera pra revisão se todas as páginas
-- terminaram" que o trigger assíncrono usa (item 3: conteúdo nunca fica
-- preso por causa da arte). ──
create or replace function public.pilot_mark_visual_asset_failed(p_page_id uuid, p_reason text)
returns public.content_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_page public.content_pages;
begin
  update public.content_pages
  set visual_asset_status = 'failed', visual_generation_attempts = visual_generation_attempts + 1, updated_at = now()
  where id = p_page_id
  returning * into v_page;

  if v_page.id is null then
    raise exception 'Página % não encontrada.', p_page_id;
  end if;

  perform public.log_audit_event(
    (select workspace_id from public.contents where id = v_page.content_id),
    'pilot_visual_asset_failed', 'content_pages', v_page.id, jsonb_build_object('reason', p_reason, 'attempts', v_page.visual_generation_attempts)
  );

  perform public._pilot_submit_content_if_visual_complete(v_page.content_id);

  return v_page;
end;
$function$;

revoke all on function public.pilot_mark_visual_asset_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.pilot_mark_visual_asset_failed(uuid, text) to service_role;

-- ── reivindica, com SKIP LOCKED (mesmo padrão de claim_pilot_plan_items_for_generation),
-- páginas elegíveis para UM retry automático controlado (attempts = 1,
-- nunca tentado de novo automaticamente — retries adicionais só via botão
-- manual "Tentar gerar arte novamente"). Marca 'pending' atomicamente pra
-- nenhum outro tick concorrente pegar a mesma página. ──
create or replace function public.pilot_claim_visual_assets_for_auto_retry(p_limit integer default 20)
returns setof public.content_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.content_pages;
begin
  for v_row in
    update public.content_pages cp
    set visual_asset_status = 'pending', updated_at = now()
    from (
      select cp2.id
      from public.content_pages cp2
      join public.contents c on c.id = cp2.content_id
      join public.pilot_settings ps on ps.workspace_id = c.workspace_id
      where cp2.visual_asset_status = 'failed'
        and cp2.visual_generation_attempts = 1
        and c.origin = 'autopilot'
        and ps.auto_generate_art = true
        and ps.status = 'active'
      order by cp2.updated_at asc
      limit p_limit
      for update of cp2 skip locked
    ) eligible
    where cp.id = eligible.id
    returning cp.*
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;

revoke all on function public.pilot_claim_visual_assets_for_auto_retry(integer) from public, anon, authenticated;
grant execute on function public.pilot_claim_visual_assets_for_auto_retry(integer) to service_role;

-- ── retry manual (owner/admin) — sempre disponível, independe do toggle
-- auto_generate_art (ação explícita do usuário sempre pode tentar de
-- novo). Só reivindica se a página está mesmo 'failed', pra ser
-- idempotente contra duplo-clique. ──
create or replace function public.pilot_claim_visual_asset_manual_retry(p_page_id uuid)
returns public.content_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.content_pages;
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id from public.content_pages cp join public.contents c on c.id = cp.content_id where cp.id = p_page_id;
  if v_workspace_id is null then
    raise exception 'Página não encontrada.';
  end if;
  if not public.has_workspace_role(v_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode tentar gerar a arte novamente.';
  end if;

  update public.content_pages
  set visual_asset_status = 'pending', updated_at = now()
  where id = p_page_id and visual_asset_status = 'failed'
  returning * into v_page;

  if v_page.id is null then
    raise exception 'Esta página não está com falha na geração de arte (ou já está sendo reprocessada).';
  end if;

  return v_page;
end;
$function$;

revoke all on function public.pilot_claim_visual_asset_manual_retry(uuid) from public, anon;
grant execute on function public.pilot_claim_visual_asset_manual_retry(uuid) to authenticated;
