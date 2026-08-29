-- Etapa 3 — fechamento técnico: diferencia o timeout da primeira checagem
-- (3min, evita falso positivo pra latência normal da Kie) do timeout das
-- rechecagens seguintes (1min, já sabemos que a task está viva, só ainda
-- não terminou — não faz sentido esperar outros 3min inteiros de novo).
-- recovery_claimed_at continua sendo a referência correta depois da
-- primeira tentativa (coalesce inalterado); só o número de minutos usado
-- na comparação passa a depender de recovery_attempts. FOR UPDATE SKIP
-- LOCKED, MAX_ATTEMPTS, toda a lógica de crédito/refund e a estrutura dos
-- dois loops permanecem exatamente como estavam.
CREATE OR REPLACE FUNCTION public.claim_stuck_image_generations(
  p_timeout_minutes integer DEFAULT 3,
  p_max_attempts integer DEFAULT 5,
  p_limit integer DEFAULT 20,
  p_retry_timeout_minutes integer DEFAULT 1
)
 RETURNS TABLE(id uuid, task_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and coalesce(ag.recovery_claimed_at, ag.updated_at) < now() - ((case when ag.recovery_attempts = 0 then p_timeout_minutes else p_retry_timeout_minutes end) || ' minutes')::interval
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
      and coalesce(ag.recovery_claimed_at, ag.updated_at) < now() - ((case when ag.recovery_attempts = 0 then p_timeout_minutes else p_retry_timeout_minutes end) || ' minutes')::interval
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
