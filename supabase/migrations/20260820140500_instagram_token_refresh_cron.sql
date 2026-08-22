-- Fase 7 — renovação diária de tokens do Instagram (item 19). Reaproveita
-- o mesmo segredo do worker de publicação (instagram_publish_worker_secret,
-- gravado no Vault fora de migrations).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'instagram-token-refresh-daily') then
    perform cron.schedule(
      'instagram-token-refresh-daily',
      '0 6 * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/instagram-token-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_publish_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) as request_id;
      $cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'instagram-token-refresh-daily'),
      schedule => '0 6 * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/instagram-token-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_publish_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
