-- Fase 7 — Publicação real. pg_cron chama o Edge Function
-- instagram-publish-worker a cada minuto via pg_net (padrão oficial do
-- Supabase: https://supabase.com/docs/guides/functions/schedule-functions).
-- O segredo compartilhado usado para autenticar a chamada foi gerado e
-- gravado no Vault fora desta migration (nunca em texto plano num
-- arquivo versionado) — aqui só referenciamos o NOME do secret via
-- vault.decrypted_secrets, nunca o valor literal.
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'instagram-publish-worker-every-minute') then
    perform cron.schedule(
      'instagram-publish-worker-every-minute',
      '* * * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/instagram-publish-worker',
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
      (select jobid from cron.job where jobname = 'instagram-publish-worker-every-minute'),
      schedule => '* * * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/instagram-publish-worker',
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
