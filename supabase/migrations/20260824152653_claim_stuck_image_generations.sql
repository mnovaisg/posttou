
-- Recovery backend para geração de imagem (ai_generations.generation_type
-- = 'imagem') presa em 'processing' além de um tempo razoável — caso real
-- comprovado no teste de custo Kie.ai (webhook nunca chegou, task_id
-- concluída com sucesso no lado da Kie). NÃO é um segundo pipeline de
-- conclusão: só reivindica (claim/lock, mesmo padrão de
-- pilot_reclaim_stuck_plan_items) e devolve as linhas elegíveis; quem
-- chama a Kie e conclui é sempre completeImageGeneration() (mesma função
-- usada por ai-webhook e ai-check-image) — chamada pelo Edge Function que
-- invoca esta RPC, nunca duplicada aqui.
--
-- Linhas que já esgotaram as tentativas de recovery são falhadas e
-- estornadas AQUI mesmo, usando exatamente a mesma política de
-- falha/estorno que completeImageGeneration usa em caso de falha
-- (status='failed' + refund_ai_generation_system) — não uma política
-- nova.
create or replace function public.claim_stuck_image_generations(
  p_timeout_minutes integer default 10,
  p_max_attempts integer default 5,
  p_limit integer default 20
)
returns table(id uuid, task_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  perform set_config('posttou.system_actor', 'ai_recovery_worker', true);

  -- Esgotou tentativas: falha definitivamente (mesma política de
  -- falha/estorno de completeImageGeneration), nunca mais reivindicada.
  for v_row in
    select ag.*
    from public.ai_generations ag
    where ag.generation_type = 'imagem'
      and ag.status = 'processing'
      and ag.task_id is not null
      and ag.recovery_attempts >= p_max_attempts
      and coalesce(ag.recovery_claimed_at, ag.updated_at) < now() - (p_timeout_minutes || ' minutes')::interval
    order by ag.updated_at asc
    limit p_limit
    for update of ag skip locked
  loop
    update public.ai_generations
    set status = 'failed',
        error_code = 'recovery_max_attempts_exceeded',
        error_message = 'Geração presa em processamento além do limite de tentativas de recuperação.',
        completed_at = now()
    where ai_generations.id = v_row.id
      and ai_generations.status = 'processing';

    if v_row.credit_ledger_id is not null then
      perform public.refund_ai_generation_system(v_row.id);
    end if;

    perform public.log_audit_event(v_row.workspace_id, 'ai_image_recovery_max_attempts_failed', 'ai_generations', v_row.id,
      jsonb_build_object('recovery_attempts', v_row.recovery_attempts, 'task_id', v_row.task_id));
  end loop;

  -- Elegíveis para mais uma tentativa: reivindica (claim/lock) e devolve
  -- para o Edge Function consultar a Kie e reconciliar via
  -- completeImageGeneration.
  for v_row in
    select ag.*
    from public.ai_generations ag
    where ag.generation_type = 'imagem'
      and ag.status = 'processing'
      and ag.task_id is not null
      and ag.recovery_attempts < p_max_attempts
      and coalesce(ag.recovery_claimed_at, ag.updated_at) < now() - (p_timeout_minutes || ' minutes')::interval
    order by coalesce(ag.recovery_claimed_at, ag.updated_at) asc
    limit p_limit
    for update of ag skip locked
  loop
    update public.ai_generations
    set recovery_claimed_at = now(),
        recovery_attempts = recovery_attempts + 1
    where ai_generations.id = v_row.id;

    perform public.log_audit_event(v_row.workspace_id, 'ai_image_recovery_claimed', 'ai_generations', v_row.id,
      jsonb_build_object('recovery_attempts', v_row.recovery_attempts + 1, 'task_id', v_row.task_id));

    id := v_row.id;
    task_id := v_row.task_id;
    return next;
  end loop;

  return;
end;
$function$;
