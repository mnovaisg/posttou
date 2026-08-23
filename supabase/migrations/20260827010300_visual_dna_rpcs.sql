-- Fase 12 — RPCs de DNA visual: claim idempotente da rodada (com cobrança
-- de crédito quando aplicável), confirmação com lock, ajuste manual.

create or replace function public.claim_visual_dna_generation(p_workspace_id uuid)
returns public.visual_dna_option_sets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_round integer;
  v_cost integer;
  v_ledger public.credit_ledger;
  v_set public.visual_dna_option_sets;
  v_label text;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode gerar direções visuais.';
  end if;

  -- Item 54/61: lock por workspace — dois cliques não geram duas rodadas
  -- nem cobram duas vezes. O índice parcial (1 "generating" por workspace)
  -- é a garantia final, mas o lock evita a corrida na contagem de rodada.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 1));

  if exists (select 1 from public.visual_dna_option_sets where workspace_id = p_workspace_id and status = 'generating') then
    raise exception 'Já existe uma rodada de direções visuais em andamento para este workspace.';
  end if;

  -- Ajuste 1: contagem NUNCA reseta (conta toda linha já criada, mesmo
  -- rodadas com falha) — 2 primeiras rodadas grátis, da 3ª em diante 45 créditos.
  select count(*) into v_round from public.visual_dna_option_sets where workspace_id = p_workspace_id;
  v_round := v_round + 1;
  v_cost := case when v_round <= 2 then 0 else 45 end;

  if v_cost > 0 then
    select * into v_ledger from public.consume_credits(p_workspace_id, v_cost, 'visual_dna_generation', 'visual_dna_option_sets', null, jsonb_build_object('round', v_round));
  end if;

  insert into public.visual_dna_option_sets (workspace_id, round_number, credit_cost, credit_ledger_id, created_by)
  values (p_workspace_id, v_round, v_cost, v_ledger.id, auth.uid())
  returning * into v_set;

  foreach v_label in array array['A', 'B', 'C'] loop
    insert into public.visual_dna_options (option_set_id, workspace_id, label) values (v_set.id, p_workspace_id, v_label);
  end loop;

  perform public.log_audit_event(p_workspace_id, 'visual_dna_options_generated', 'visual_dna_option_sets', v_set.id, jsonb_build_object('round', v_round, 'credit_cost', v_cost));

  return v_set;
end;
$function$;

revoke all on function public.claim_visual_dna_generation(uuid) from public, anon;
grant execute on function public.claim_visual_dna_generation(uuid) to authenticated;

-- ── Confirmação: cria nova versão (nunca sobrescreve — item 21), com lock
-- pra evitar 2 opções confirmadas simultaneamente (item 69). ──
create or replace function public.confirm_visual_dna_option(p_option_id uuid)
returns public.brand_visual_dna
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_option public.visual_dna_options;
  v_next_version integer;
  v_row public.brand_visual_dna;
begin
  select * into v_option from public.visual_dna_options where id = p_option_id;
  if v_option.id is null then
    raise exception 'Opção não encontrada.';
  end if;
  if not public.has_workspace_role(v_option.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode confirmar uma direção visual.';
  end if;
  if v_option.status <> 'generated' or v_option.attributes is null then
    raise exception 'Esta opção ainda não está pronta.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_option.workspace_id::text, 2));

  update public.brand_visual_dna set status = 'superseded' where workspace_id = v_option.workspace_id and status = 'active';

  select coalesce(max(version), 0) + 1 into v_next_version from public.brand_visual_dna where workspace_id = v_option.workspace_id;

  insert into public.brand_visual_dna (workspace_id, version, based_on_option_id, reference_ids, attributes, confirmed_by)
  select
    v_option.workspace_id, v_next_version, v_option.id,
    coalesce((select array_agg(id) from public.brand_reference_profiles where workspace_id = v_option.workspace_id and removed_at is null), '{}'),
    v_option.attributes, auth.uid()
  returning * into v_row;

  perform public.log_audit_event(v_option.workspace_id, 'visual_dna_selected', 'brand_visual_dna', v_row.id, jsonb_build_object('option_id', v_option.id, 'label', v_option.label));
  perform public.log_audit_event(v_option.workspace_id, 'visual_dna_confirmed', 'brand_visual_dna', v_row.id, jsonb_build_object('version', v_row.version));

  return v_row;
end;
$function$;

revoke all on function public.confirm_visual_dna_option(uuid) from public, anon;
grant execute on function public.confirm_visual_dna_option(uuid) to authenticated;

-- ── Ajuste manual pós-confirmação (itens 23/26/34) — usuário é autoridade,
-- sempre cria nova versão. ──
create or replace function public.adjust_brand_visual_dna(p_workspace_id uuid, p_attributes jsonb)
returns public.brand_visual_dna
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next_version integer;
  v_current public.brand_visual_dna;
  v_row public.brand_visual_dna;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode ajustar o DNA visual.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 2));

  select * into v_current from public.brand_visual_dna where workspace_id = p_workspace_id and status = 'active';

  update public.brand_visual_dna set status = 'superseded' where workspace_id = p_workspace_id and status = 'active';

  select coalesce(max(version), 0) + 1 into v_next_version from public.brand_visual_dna where workspace_id = p_workspace_id;

  insert into public.brand_visual_dna (workspace_id, version, based_on_option_id, reference_ids, attributes, confirmed_by)
  values (p_workspace_id, v_next_version, null, coalesce(v_current.reference_ids, '{}'), p_attributes, auth.uid())
  returning * into v_row;

  perform public.log_audit_event(p_workspace_id, 'visual_dna_updated', 'brand_visual_dna', v_row.id, jsonb_build_object('version', v_row.version));

  return v_row;
end;
$function$;

revoke all on function public.adjust_brand_visual_dna(uuid, jsonb) from public, anon;
grant execute on function public.adjust_brand_visual_dna(uuid, jsonb) to authenticated;

-- ── "Nenhum desses" ──
create or replace function public.dismiss_visual_dna_option_set(p_option_set_id uuid, p_feedback text default null)
returns public.visual_dna_option_sets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_set public.visual_dna_option_sets;
begin
  select * into v_set from public.visual_dna_option_sets where id = p_option_set_id;
  if v_set.id is null then
    raise exception 'Rodada não encontrada.';
  end if;
  if not public.has_workspace_role(v_set.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Sem permissão.';
  end if;

  update public.visual_dna_option_sets set status = 'dismissed', status_reason = p_feedback, finished_at = now() where id = p_option_set_id
  returning * into v_set;

  return v_set;
end;
$function$;

revoke all on function public.dismiss_visual_dna_option_set(uuid, text) from public, anon;
grant execute on function public.dismiss_visual_dna_option_set(uuid, text) to authenticated;

-- ── Sincroniza o estado das 3 imagens (ai_generations) pro option_set —
-- chamada pelo frontend em polling, mesma régua de leitura já usada pelo
-- Editor Visual. Nunca decide crédito/estado de negócio, só espelha o
-- status determinístico já existente em ai_generations. ──
create or replace function public.sync_visual_dna_option_set(p_option_set_id uuid)
returns public.visual_dna_option_sets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_set public.visual_dna_option_sets;
  v_opt record;
  v_gen record;
  v_all_done boolean := true;
  v_any_success boolean := false;
begin
  select * into v_set from public.visual_dna_option_sets where id = p_option_set_id;
  if v_set.id is null then
    raise exception 'Rodada não encontrada.';
  end if;
  if auth.uid() is not null and not public.is_workspace_member(v_set.workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;
  if v_set.status <> 'generating' then
    return v_set;
  end if;

  for v_opt in select * from public.visual_dna_options where option_set_id = p_option_set_id loop
    if v_opt.status = 'pending' and v_opt.ai_generation_id is not null then
      select * into v_gen from public.ai_generations where id = v_opt.ai_generation_id;
      if v_gen.status = 'success' then
        update public.visual_dna_options
        set status = 'generated', preview_asset_path = v_gen.result_asset_paths[1]
        where id = v_opt.id;
        v_any_success := true;
      elsif v_gen.status = 'failed' then
        update public.visual_dna_options set status = 'failed' where id = v_opt.id;
      else
        v_all_done := false;
      end if;
    elsif v_opt.status = 'pending' then
      v_all_done := false;
    end if;
  end loop;

  if v_all_done then
    update public.visual_dna_option_sets
    set status = case when v_any_success then 'ready' else 'failed' end, finished_at = now()
    where id = p_option_set_id
    returning * into v_set;
  end if;

  return v_set;
end;
$function$;

revoke all on function public.sync_visual_dna_option_set(uuid) from public, anon;
grant execute on function public.sync_visual_dna_option_set(uuid) to authenticated, service_role;
