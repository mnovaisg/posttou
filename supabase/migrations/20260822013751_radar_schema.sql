-- Fase 8 — Radar Viral: schema base.
-- radar_signals/radar_clusters/radar_cluster_signals/radar_provider_config/
-- radar_scoring_config/radar_runs são cache/config GLOBAL compartilhado
-- entre workspaces (mesmo padrão de instagram_handle_snapshots e
-- pre_onboarding_sessions): RLS habilitado, ZERO policies — só
-- service_role (Edge Functions) acessa. Nunca expor ao frontend direto.
-- radar_opportunities é workspace-scoped (padrão is_workspace_member).
create extension if not exists pg_trgm;

create table public.radar_provider_config (
  provider text primary key,
  enabled boolean not null default true,
  cache_ttl_hours integer not null default 24 check (cache_ttl_hours > 0),
  max_signals_per_run integer not null default 50 check (max_signals_per_run > 0),
  notes text,
  updated_at timestamptz not null default now()
);
comment on table public.radar_provider_config is 'Registro de providers plugáveis do Radar (Fase 8). TTL de cache e limite de coleta configuráveis por provider sem redeploy.';

insert into public.radar_provider_config (provider, enabled, cache_ttl_hours, max_signals_per_run, notes) values
  ('youtube', true, 24, 60, 'Única fonte externa aprovada no MVP (videos.list mostPopular). Ver relatório Fase 8.');

create table public.radar_scoring_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.radar_scoring_config is 'Pesos e limites do Radar (viral_score, opportunity_score, brand_fit_score, limites de custo) — centralizados no backend, nunca hardcoded/espalhados no frontend. Lido pelo worker a cada execução.';

insert into public.radar_scoring_config (key, value) values
  ('viral_score_weights', '{"recency": 30, "engagement": 40, "recurrence": 30}'::jsonb),
  ('opportunity_score_weights', '{"viral": 0.35, "brand_fit": 0.35, "novelty": 0.20, "recency_bonus": 0.10}'::jsonb),
  ('brand_fit_weights', '{"nicho": 40, "publico": 30, "tom": 30}'::jsonb),
  ('limits', '{"max_signals_per_run": 60, "max_clusters_per_run": 40, "top_n_per_workspace": 5, "max_workspaces_per_run": 50, "novelty_lookback_days": 60}'::jsonb);

create table public.radar_signals (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.radar_provider_config(provider),
  external_id text not null,
  signal_type text not null,
  title text,
  text_content text,
  url text,
  author_name text,
  author_handle text,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
comment on table public.radar_signals is 'Cache GLOBAL de sinais brutos coletados de fontes externas (Fase 8). metrics guarda {campo: {value, available}} — ausência nunca vira zero. expires_at respeita o TTL/retenção do provider (ex.: 30 dias do ToS do YouTube).';
create index radar_signals_expires_at_idx on public.radar_signals (expires_at);
create index radar_signals_provider_idx on public.radar_signals (provider, fetched_at desc);

create table public.radar_clusters (
  id uuid primary key default gen_random_uuid(),
  theme_summary text not null,
  primary_topic text,
  signal_count integer not null default 0,
  provider_diversity integer not null default 0,
  viral_score numeric check (viral_score >= 0 and viral_score <= 100),
  viral_score_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'expired')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.radar_clusters is 'Agrupamento semântico GLOBAL de radar_signals (Fase 8). viral_score_breakdown guarda os componentes e pesos usados, inclusive quando renormalizados por falta de dado — a UI explica o score a partir daqui, nunca de um número solto.';

create table public.radar_cluster_signals (
  cluster_id uuid not null references public.radar_clusters(id) on delete cascade,
  signal_id uuid not null references public.radar_signals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cluster_id, signal_id)
);

create table public.radar_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cluster_id uuid not null references public.radar_clusters(id) on delete cascade,
  brand_fit_score numeric not null check (brand_fit_score >= 0 and brand_fit_score <= 100),
  brand_fit_breakdown jsonb not null default '{}'::jsonb,
  novelty_score numeric not null check (novelty_score >= 0 and novelty_score <= 100),
  novelty_method text not null default 'lexical' check (novelty_method in ('lexical', 'semantic')),
  opportunity_score numeric not null check (opportunity_score >= 0 and opportunity_score <= 100),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  suggested_title text,
  suggested_angle text,
  suggested_format public.content_type,
  ai_generation_id uuid references public.ai_generations(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'saved', 'used', 'dismissed', 'expired')),
  dismissed_reason text,
  used_content_id uuid references public.contents(id) on delete set null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, cluster_id)
);
comment on table public.radar_opportunities is 'Oportunidade específica de um workspace para um radar_cluster (Fase 8). unique(workspace_id, cluster_id) + upsert_radar_opportunity() evitam recriar oportunidades duplicadas a cada run. brand_fit_score é sempre soma determinística de brand_fit_breakdown — nunca um número solto vindo direto do LLM.';
create index radar_opportunities_workspace_status_idx on public.radar_opportunities (workspace_id, status, opportunity_score desc);

create table public.radar_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial_failure', 'failed')),
  providers_attempted text[] not null default '{}',
  providers_succeeded text[] not null default '{}',
  providers_failed jsonb not null default '{}'::jsonb,
  signals_collected integer not null default 0,
  signals_deduplicated integer not null default 0,
  clusters_created integer not null default 0,
  clusters_updated integer not null default 0,
  workspaces_processed integer not null default 0,
  opportunities_created integer not null default 0,
  opportunities_updated integer not null default 0,
  ai_calls integer not null default 0,
  ai_usage jsonb not null default '{}'::jsonb,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);
comment on table public.radar_runs is 'Observabilidade de cada execução do worker do Radar (Fase 8). ai_usage segue o mesmo formato de pre_onboarding_sessions.ai_usage: {input_tokens, output_tokens, estimated_cost_usd} — estimated_cost_usd só preenchido quando o preço por token está configurado, nunca inventado.';

alter table public.contents add column radar_opportunity_id uuid references public.radar_opportunities(id) on delete set null;
comment on column public.contents.radar_opportunity_id is 'Rastreabilidade: conteúdo criado a partir de "Transformar em conteúdo" de uma oportunidade do Radar (Fase 8). NULL para conteúdo manual/IA direto/Discovery.';

-- RLS: tabelas globais (cache/config compartilhado) — zero policies, só service_role.
alter table public.radar_provider_config enable row level security;
alter table public.radar_scoring_config enable row level security;
alter table public.radar_signals enable row level security;
alter table public.radar_clusters enable row level security;
alter table public.radar_cluster_signals enable row level security;
alter table public.radar_runs enable row level security;

-- RLS: radar_opportunities é workspace-scoped — membros podem ler; toda
-- escrita passa por RPC SECURITY DEFINER (upsert do worker via
-- service_role, transições de status do usuário via RPCs dedicadas).
alter table public.radar_opportunities enable row level security;

create policy "radar_opportunities_select_members"
  on public.radar_opportunities for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.radar_opportunities to authenticated;
