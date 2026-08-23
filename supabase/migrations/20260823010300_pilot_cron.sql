-- Fase 9 — pg_cron chama o pilot-cron-dispatcher a cada 30 min via
-- pg_net (mesmo padrão dos workers das Fases 7/8). Um único job global
-- (item 59) — o dispatcher, não o cron, decide quais workspaces
-- semi_auto precisam de novo plano/geração nesta execução.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'pilot-cron-dispatcher-every-30-min') then
    perform cron.schedule(
      'pilot-cron-dispatcher-every-30-min',
      '*/30 * * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/pilot-cron-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilot_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
      $cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'pilot-cron-dispatcher-every-30-min'),
      schedule => '*/30 * * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/pilot-cron-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilot_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
