-- Fase 8 — pg_cron chama o radar-worker a cada 4h via pg_net (mesmo
-- padrão do worker de publicação da Fase 7). TTL do cache de sinais
-- (24h) e do cluster (3 dias sem novo sinal) tornam desnecessário rodar
-- com mais frequência; o próprio worker é idempotente (upsert + TTL) e
-- não gasta quota do YouTube nem chama IA à toa se o cache ainda é válido.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'radar-worker-every-4-hours') then
    perform cron.schedule(
      'radar-worker-every-4-hours',
      '0 */4 * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/radar-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
      $cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'radar-worker-every-4-hours'),
      schedule => '0 */4 * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/radar-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
