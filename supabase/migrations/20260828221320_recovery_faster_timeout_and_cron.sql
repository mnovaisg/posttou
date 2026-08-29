-- Etapa 3A — webhook validado e funcionando (200, assinatura HMAC ok,
-- ai_webhook_events gravado). Recovery deixa de ser o caminho principal e
-- vira rede de segurança: reduz o limiar de "presa" de 10 para 3 minutos
-- (baseline real da Kie é ~60-90s, então 3min já dá margem confortável) e
-- o cron passa a rodar a cada 2 minutos em vez de 10. Corpo da função
-- inalterado — só o default do timeout muda; FOR UPDATE SKIP LOCKED,
-- filtro status='processing' e toda a lógica de crédito/refund
-- permanecem exatamente como estavam.
CREATE OR REPLACE FUNCTION public.claim_stuck_image_generations(p_timeout_minutes integer DEFAULT 3, p_max_attempts integer DEFAULT 5, p_limit integer DEFAULT 20)
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

-- Cron: troca o job de 10 em 10 min por um de 2 em 2 min. Unschedule pelo
-- nome antigo (evita duplicar job) e agenda um novo nome que reflete o
-- intervalo real.
select cron.unschedule('ai-recovery-check-images-every-10-min');

select cron.schedule(
  'ai-recovery-check-images-every-2-min',
  '*/2 * * * *',
  $$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/ai-recovery-check-images',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) as request_id;
      $$
);
