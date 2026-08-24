-- Fase 14B — cron diário que converte estados efetivos de assinatura em
-- estado gravado (trial vencido, past_due fora da tolerância,
-- cancel_at_period_end vencido, downgrade agendado). Mesmo padrão dos
-- outros crons do produto (pg_net + secret no vault).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'billing-cron-dispatcher-daily') then
    perform cron.schedule(
      'billing-cron-dispatcher-daily',
      '0 3 * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/billing-cron-dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
