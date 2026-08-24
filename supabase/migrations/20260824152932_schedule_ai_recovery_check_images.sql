
select cron.schedule(
  'ai-recovery-check-images-every-10-min',
  '*/10 * * * *',
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
