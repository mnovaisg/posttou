-- Telemetria de custo da Discovery pública: ai_provider/ai_model
-- sozinhos não bastam para estimar custo. ai_usage guarda o uso real
-- retornado pelo provider (tokens) + custo estimado quando o preço por
-- token está configurado no ambiente — nunca inventado quando não está.
alter table public.pre_onboarding_sessions
  add column ai_usage jsonb not null default '{}'::jsonb;

comment on column public.pre_onboarding_sessions.ai_usage is 'Uso real da chamada de IA desta sessão: {input_tokens, output_tokens, estimated_cost_usd}. estimated_cost_usd só é preenchido quando o preço por token está configurado (env) — nunca inventado.';

create or replace view public.discovery_usage_daily as
select
  date_trunc('day', created_at) as day,
  count(*) as total_sessions,
  count(*) filter (where used_cached_snapshot) as cache_hits,
  count(*) filter (where not used_cached_snapshot) as meta_calls,
  count(*) filter (where status = 'ready') as ai_success,
  count(*) filter (where status = 'failed') as ai_failed,
  count(*) filter (where claimed_at is not null) as claimed_conversions,
  sum(coalesce((ai_usage->>'input_tokens')::numeric, 0)) as total_ai_input_tokens,
  sum(coalesce((ai_usage->>'output_tokens')::numeric, 0)) as total_ai_output_tokens,
  sum(coalesce((ai_usage->>'estimated_cost_usd')::numeric, 0)) as total_estimated_cost_usd
from public.pre_onboarding_sessions
group by 1
order by 1 desc;

revoke all on public.discovery_usage_daily from public, anon, authenticated;
