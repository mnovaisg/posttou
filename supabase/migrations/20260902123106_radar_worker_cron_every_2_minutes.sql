
-- Hotfix: cron de 4h → 2min. Cada tick agora só drena um lote pequeno
-- da fila (radar_match_jobs), então precisa rodar com frequência para
-- esvaziar a fila em tempo razoável — collect/cluster continuam
-- cache-gated (24h/3 dias), então ticks extras nesse trecho são
-- baratos (no-op na prática).
select cron.unschedule('radar-worker-every-4-hours');

select cron.schedule(
  'radar-worker-every-2-minutes',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/radar-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
