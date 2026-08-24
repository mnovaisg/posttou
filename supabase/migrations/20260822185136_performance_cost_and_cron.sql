-- Fase 10 — custo do insight manual + crons do collector/gerador de insights.

insert into public.ai_operation_costs (generation_type, credit_cost) values
  ('performance_insight', 3)
on conflict (generation_type) do nothing;

comment on table public.ai_operation_costs is 'Custo em créditos por tipo de geração, decidido no servidor. Frontend só lê para exibir o preço. performance_insight (Fase 10) só é debitado no caminho MANUAL ("Explicar melhor") — a geração automática de interpretação não consome crédito (ajuste 6).';

-- Collector de métricas: cadência generosa o bastante pra cobrir os
-- buckets de 1h/6h/24h/72h/7d sem nunca se aproximar do rate limit da
-- Meta (200 chamadas/usuário/hora — ver plano aprovado, seção B).
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'performance-metrics-collector-every-15-min') then
    perform cron.schedule(
      'performance-metrics-collector-every-15-min',
      '*/15 * * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/performance-metrics-collector',
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
      (select jobid from cron.job where jobname = 'performance-metrics-collector-every-15-min'),
      schedule => '*/15 * * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/performance-metrics-collector',
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

-- Gerador de insights: roda no máximo 1x/dia por workspace, mas a
-- Edge Function DECIDE internamente se há fato novo/significativo antes
-- de gerar qualquer interpretação (ajuste 6 — nunca "IA porque passou um
-- dia"). O cron só garante que a checagem acontece; a chamada de IA em si
-- é condicional.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'performance-insights-generator-daily') then
    perform cron.schedule(
      'performance-insights-generator-daily',
      '0 9 * * *',
      $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/performance-insights-generator',
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
      (select jobid from cron.job where jobname = 'performance-insights-generator-daily'),
      schedule => '0 9 * * *',
      command => $cron$
      select net.http_post(
        url := 'https://japufmcbhvusgcbhhhby.supabase.co/functions/v1/performance-insights-generator',
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
