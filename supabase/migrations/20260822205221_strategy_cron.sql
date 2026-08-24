-- Fase 11 — cron do gerador de recomendações. Função dedicada própria
-- (não colada no performance-insights-generator — evita misturar
-- responsabilidades/segredos/observabilidade das duas fases), mas reaproveita
-- o mesmo secret compartilhado (PERFORMANCE_WORKER_SECRET) já configurado
-- para os workers de Performance — nenhum secret novo para o usuário criar.
-- Roda 5 minutos depois do gerador de insights da Fase 10, garantindo que
-- as recomendações do dia sempre reflitam os fatos mais recentes.
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'strategy-recommendations-generator-daily') then
    perform cron.schedule(
      'strategy-recommendations-generator-daily',
      '5 9 * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/strategy-recommendations-generator',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'performance_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) as request_id;
      $cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'strategy-recommendations-generator-daily'),
      schedule => '5 9 * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/strategy-recommendations-generator',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-posttou-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'performance_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) as request_id;
      $cron$
    );
  end if;
end;
$$;
