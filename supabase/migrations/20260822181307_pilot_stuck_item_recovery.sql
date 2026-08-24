-- Fase 9 — correção final: recovery automático de pilot_plan_items
-- presos em 'generating' (achado real durante os testes: uma exceção no
-- meio do lote deixava o item sem resolução).
--
-- Arquitetura: NÃO cria worker/infra paralela. O recovery só faz 3
-- coisas — (a) detectar itens travados; (b) reconciliar quando o
-- conteúdo já existe (idempotência, nunca duplica); (c) limpar qualquer
-- ai_generations pendurada (crédito já debitado, sem conteúdo) e devolver
-- o item para status='approved'. A partir daí, o pipeline JÁ EXISTENTE
-- e já testado (claim_pilot_plan_items_for_generation dentro de
-- pilot-content-generate, com checagem de orçamento/saldo) cuida do
-- resto — mesmo código, mesmos guard-rails, sem duplicar lógica.
-- O pilot-cron-dispatcher (já rodando a cada 30 min, item 59 da missão)
-- chama esse reclaim antes de processar planos novos.

alter table public.pilot_plan_items
  add column attempt_count integer not null default 0,
  add column last_attempt_at timestamptz,
  add column last_error text,
  add column claimed_at timestamptz;

comment on column public.pilot_plan_items.attempt_count is 'Incrementado a cada tentativa de geração (primeira via claim_pilot_plan_items_for_generation, ou retries via pilot_reclaim_stuck_plan_items). Item falha definitivamente ao atingir o máximo de tentativas.';
comment on column public.pilot_plan_items.claimed_at is 'Setado no momento em que o item é reivindicado para geração (status vira generating). Usado pelo recovery para detectar itens travados (claimed_at antigo demais).';
comment on column public.pilot_plan_items.last_error is 'Erro da tentativa mais recente (mesmo enquanto o item ainda pode ser tentado de novo) — distinto de status_reason, que só é preenchido quando o item chega a um estado terminal (skipped/failed).';

-- Passa a registrar attempt_count/claimed_at também na reivindicação
-- normal (não só no recovery) — mesmo padrão de claim_instagram_publications.
create or replace function public.claim_pilot_plan_items_for_generation(p_plan_id uuid, p_limit integer default 20)
returns setof public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.pilot_plan_items;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);
  for v_row in
    update public.pilot_plan_items pi
    set status = 'generating', claimed_at = now(), last_attempt_at = now(), attempt_count = pi.attempt_count + 1, updated_at = now()
    from (
      select id from public.pilot_plan_items
      where pilot_plan_id = p_plan_id and status = 'approved'
      order by scheduled_for asc
      limit p_limit
      for update skip locked
    ) eligible
    where pi.id = eligible.id
    returning pi.*
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;

-- resolve_pilot_plan_item também grava last_error nas resoluções não-geradas.
create or replace function public.resolve_pilot_plan_item(p_item_id uuid, p_outcome text, p_content_id uuid default null, p_reason text default null)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.pilot_plan_items;
begin
  if p_outcome not in ('generated', 'skipped', 'failed') then
    raise exception 'Outcome inválido: %', p_outcome;
  end if;
  perform set_config('posttou.system_actor', 'pilot_worker', true);

  update public.pilot_plan_items
  set status = p_outcome::public.pilot_plan_item_status,
      content_id = case when p_outcome = 'generated' then p_content_id else content_id end,
      status_reason = case when p_outcome <> 'generated' then p_reason else status_reason end,
      last_error = case when p_outcome <> 'generated' then p_reason else last_error end,
      updated_at = now()
  where id = p_item_id and status = 'generating'
  returning * into v_item;

  if v_item.id is null then
    raise exception 'Item % não está em estado "generating".', p_item_id;
  end if;

  perform public.log_audit_event(
    v_item.workspace_id,
    case p_outcome when 'generated' then 'pilot_content_generated' when 'skipped' then 'pilot_plan_item_skipped' else 'pilot_run_failed' end,
    'pilot_plan_items', v_item.id,
    jsonb_build_object('content_id', p_content_id, 'reason', p_reason)
  );

  if not exists (select 1 from public.pilot_plan_items where pilot_plan_id = v_item.pilot_plan_id and status in ('approved', 'generating')) then
    update public.pilot_plans set status = 'completed', updated_at = now() where id = v_item.pilot_plan_id and status = 'generating';
  end if;

  return v_item;
end;
$function$;

-- ═══════════════════ RECOVERY ═══════════════════
-- Detecta pilot_plan_items presos em 'generating' há mais tempo que o
-- timeout (padrão 10 min — folgado o suficiente mesmo para o maior lote
-- possível: max_posts_per_window é limitado a 14 pelo próprio check
-- constraint de pilot_settings, e cada item leva no máximo ~35s
-- (timeout do provider de IA + overhead), então um lote cheio termina
-- bem antes de 10 min). FOR UPDATE SKIP LOCKED garante que duas
-- execuções concorrentes do recovery nunca reivindicam o mesmo item
-- (item 7 da correção) — mesmo padrão de claim_instagram_publications.
create or replace function public.pilot_reclaim_stuck_plan_items(
  p_timeout_minutes integer default 10,
  p_max_attempts integer default 3,
  p_limit integer default 50
)
returns table(plan_id uuid, item_id uuid, outcome text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item record;
  v_existing_content_id uuid;
  v_dangling record;
  v_pilot_status public.pilot_status;
  v_content_status text;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);

  for v_item in
    select pi.*
    from public.pilot_plan_items pi
    where pi.status = 'generating'
      and pi.claimed_at is not null
      and pi.claimed_at < now() - (p_timeout_minutes || ' minutes')::interval
    order by pi.claimed_at asc
    limit p_limit
    for update of pi skip locked
  loop
    perform public.log_audit_event(v_item.workspace_id, 'pilot_generation_recovery_started', 'pilot_plan_items', v_item.id,
      jsonb_build_object('attempt_count', v_item.attempt_count, 'claimed_at', v_item.claimed_at));

    -- item 3: idempotência — nunca gerar de novo se o conteúdo já existe,
    -- seja por content_id já setado, seja por um contents.pilot_plan_item_id
    -- já apontando pra cá (crash entre criar o content e resolver o item).
    v_existing_content_id := v_item.content_id;
    if v_existing_content_id is null then
      select id into v_existing_content_id from public.contents where pilot_plan_item_id = v_item.id limit 1;
    end if;

    if v_existing_content_id is not null then
      if v_item.radar_opportunity_id is not null then
        begin
          perform public.link_radar_opportunity_content(v_item.radar_opportunity_id, v_existing_content_id);
        exception when others then
          null; -- já vinculada/usada — não bloqueia a reconciliação
        end;
      end if;

      select status into v_content_status from public.contents where id = v_existing_content_id;
      if v_content_status = 'rascunho' then
        begin
          perform public.pilot_submit_content_for_review(v_existing_content_id);
        exception when others then
          null;
        end;
      end if;

      perform public.resolve_pilot_plan_item(v_item.id, 'generated', v_existing_content_id, 'recovered_reconciled_existing_content');

      perform public.log_audit_event(v_item.workspace_id, 'pilot_generation_recovery_succeeded', 'pilot_plan_items', v_item.id,
        jsonb_build_object('content_id', v_existing_content_id, 'reconciled', true));

      plan_id := v_item.pilot_plan_id; item_id := v_item.id; outcome := 'reconciled';
      return next;
      continue;
    end if;

    -- item 2: limite de tentativas
    if v_item.attempt_count >= p_max_attempts then
      perform public.resolve_pilot_plan_item(v_item.id, 'failed', null, 'max_attempts_exceeded');

      perform public.log_audit_event(v_item.workspace_id, 'pilot_generation_recovery_failed', 'pilot_plan_items', v_item.id,
        jsonb_build_object('attempt_count', v_item.attempt_count, 'reason', 'max_attempts_exceeded'));

      plan_id := v_item.pilot_plan_id; item_id := v_item.id; outcome := 'failed_max_attempts';
      return next;
      continue;
    end if;

    -- item 5: kill switch — se pausado/desativado, deixa preso aguardando
    -- (não é falha) até o Piloto voltar a ficar ativo.
    select status into v_pilot_status from public.pilot_settings where workspace_id = v_item.workspace_id;
    if v_pilot_status is distinct from 'active' then
      plan_id := v_item.pilot_plan_id; item_id := v_item.id; outcome := 'waiting_pilot_active';
      return next;
      continue;
    end if;

    -- item 4: limpa qualquer ai_generations pendurada (crédito já
    -- debitado, geração nunca virou conteúdo) ANTES de permitir nova
    -- tentativa — nunca cobra duas vezes pela mesma geração.
    -- refund_ai_generation_system já é idempotente (não estorna 2x).
    for v_dangling in
      select * from public.ai_generations
      where workspace_id = v_item.workspace_id
        and request_payload ->> 'pilot_plan_item_id' = v_item.id::text
        and status in ('pending', 'processing')
    loop
      update public.ai_generations
      set status = 'failed', error_code = 'recovery_timeout',
          error_message = 'Item recuperado pelo Piloto após timeout — geração anterior não concluiu.',
          completed_at = now()
      where id = v_dangling.id;

      if v_dangling.credit_ledger_id is not null then
        perform public.refund_ai_generation_system(v_dangling.id);
      end if;
    end loop;

    -- Devolve para 'approved': o pipeline normal (claim + orçamento/saldo
    -- + geração, já testado) cuida do resto no próximo tick do dispatcher.
    update public.pilot_plan_items
    set status = 'approved', last_error = 'recovery_timeout', claimed_at = null, updated_at = now()
    where id = v_item.id;

    perform public.log_audit_event(v_item.workspace_id, 'pilot_generation_recovery_succeeded', 'pilot_plan_items', v_item.id,
      jsonb_build_object('requeued', true, 'attempt_count', v_item.attempt_count));

    plan_id := v_item.pilot_plan_id; item_id := v_item.id; outcome := 'requeued';
    return next;
  end loop;

  return;
end;
$function$;

comment on function public.pilot_reclaim_stuck_plan_items(integer, integer, integer) is 'Recovery de itens presos em generating (item 10 da correção final da Fase 9). Chamado pelo pilot-cron-dispatcher a cada tick, antes de processar planos novos. Nunca duplica conteúdo (reconcilia por contents.pilot_plan_item_id) nem cobra duas vezes (refund_ai_generation_system idempotente). Isolado por workspace via pilot_settings; nunca exposto a authenticated.';

revoke all on function public.pilot_reclaim_stuck_plan_items(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.pilot_reclaim_stuck_plan_items(integer, integer, integer) to service_role;
