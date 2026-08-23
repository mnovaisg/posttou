-- Fase 10 — Performance & Aprendizado: schema.
--
-- Princípio central (aprovado no plano): dado real da Meta -> fato
-- determinístico (SQL) -> recomendação (opcionalmente IA, nunca inventando
-- número) -> humano decide. Nenhuma tabela aqui altera Piloto ou DNA
-- automaticamente.
--
-- Chave de identidade: performance é ancorada em instagram_publications.id
-- (não em contents.id), porque um content pode ter mais de uma publicação
-- ao longo do tempo (republish após falha terminal cria linha nova em
-- instagram_publications — ver 20260820140100).

create type public.instagram_insights_status as enum (
  'not_connected',       -- sem conta IG conectada
  'permission_required', -- conectada, mas token sem o escopo de insights
  'available',           -- escopo concedido, coleta funcionando
  'not_supported'        -- Meta recusa insights para esta conta (raro; ver ajuste 5 — nunca por causa de 1 métrica)
);

alter table public.instagram_accounts
  add column insights_status public.instagram_insights_status not null default 'not_connected';

comment on column public.instagram_accounts.insights_status is 'Status de PERMISSÃO/CONEXÃO da conta para Insights (ajuste 5 da Fase 10) — nunca rebaixado por uma métrica específica não suportada; isso é tratado em content_performance_snapshots.unsupported_metrics.';

-- ── Snapshots: 1 linha por (publicação, bucket de idade), NUNCA por
-- tentativa — retries atualizam a mesma linha (attempt_count/next_retry_at),
-- exatamente como instagram_publications já faz. Isso resolve o ajuste 4:
-- a UNIQUE nunca bloqueia retry, porque a linha já existe desde o
-- agendamento e é só atualizada até chegar a um estado terminal. ──
create type public.performance_snapshot_status as enum (
  'pending',              -- agendado, aguardando coleta (ou aguardando retry)
  'collected',            -- coletado com sucesso (terminal)
  'permission_required',  -- token sem escopo de insights no momento da tentativa (terminal para este bucket)
  'media_unavailable',    -- mídia apagada/indisponível na Meta (terminal)
  'failed'                -- esgotou tentativas por outro motivo (terminal)
);

create table public.content_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  instagram_publication_id uuid not null references public.instagram_publications(id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts(id) on delete cascade,

  age_bucket text not null check (age_bucket in ('1h', '6h', '24h', '72h', '7d')),
  target_at timestamptz not null,       -- quando este bucket deveria ser coletado
  captured_at timestamptz,              -- quando foi coletado com sucesso (null até então)

  reach bigint,
  likes bigint,
  comments bigint,
  saved bigint,
  shares bigint,
  views bigint,
  total_interactions bigint,
  -- Métricas que a Meta recusou/não suportou PARA ESTA MÍDIA/bucket (ajuste
  -- 5) — nunca vira 0, fica ausente (null acima) e registrada aqui.
  unsupported_metrics text[] not null default '{}',
  raw_metrics jsonb not null default '{}'::jsonb,   -- resposta normalizada da Meta; nunca token/secret
  api_version text,

  collector_status public.performance_snapshot_status not null default 'pending',
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (instagram_publication_id, age_bucket)
);

create index content_performance_snapshots_workspace_idx on public.content_performance_snapshots (workspace_id);
create index content_performance_snapshots_publication_idx on public.content_performance_snapshots (instagram_publication_id);
create index content_performance_snapshots_pending_due_idx on public.content_performance_snapshots (target_at)
  where collector_status = 'pending';

comment on table public.content_performance_snapshots is 'Fase 10: histórico de coleta de métricas reais da Meta por publicação/bucket de idade. 1 linha por bucket (nunca por tentativa) — retries atualizam a mesma linha, nunca bloqueados pela UNIQUE (ajuste 4).';
comment on column public.content_performance_snapshots.unsupported_metrics is 'Métricas que a API não retornou/recusou para esta mídia específica (ajuste 5) — nunca derruba o status da CONTA, só desta métrica neste snapshot.';

alter table public.content_performance_snapshots enable row level security;

create policy content_performance_snapshots_select_members
  on public.content_performance_snapshots for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.content_performance_snapshots to authenticated;
-- Sem policy de insert/update/delete para authenticated: escrita só via
-- service_role (Edge Function collector), mesma postura de ai_generations.

-- ── Score determinístico por publicação. Recalculado a cada novo
-- snapshot coletado (não só aos 7 dias) — ajuste 3: métrica/score
-- aparecem desde o primeiro snapshot, só o RÓTULO de maturidade muda. ──
create type public.performance_maturity_stage as enum ('initial', 'evolving', 'consolidated');
create type public.performance_baseline_tier as enum ('collecting_data', 'baseline_provisional', 'baseline_ready');
create type public.performance_baseline_scope as enum ('format', 'workspace');

create table public.content_performance_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  instagram_publication_id uuid not null unique references public.instagram_publications(id) on delete cascade,
  format public.content_type not null,

  maturity_stage public.performance_maturity_stage not null default 'initial',
  latest_age_bucket text,                 -- último bucket com collector_status='collected' usado no cálculo

  baseline_tier public.performance_baseline_tier not null default 'collecting_data',
  baseline_scope public.performance_baseline_scope,      -- null enquanto collecting_data
  baseline_sample_size integer not null default 0,

  -- null enquanto baseline_tier = 'collecting_data' (ajuste 1: nunca
  -- apresentar score como conclusão forte sem amostra mínima).
  score smallint check (score is null or (score between 0 and 100)),
  relative_reach numeric,
  relative_engagement numeric,
  relative_saves numeric,
  relative_shares numeric,

  scoring_config_snapshot jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_performance_scores_workspace_idx on public.content_performance_scores (workspace_id);
create index content_performance_scores_format_idx on public.content_performance_scores (workspace_id, format);

comment on table public.content_performance_scores is 'Fase 10: score 0-100 determinístico (nunca gerado por IA) por publicação, relativo ao baseline da PRÓPRIA marca. maturity_stage é só rótulo de confiança (ajuste 3); baseline_tier controla se o score é exibido como conclusão forte (ajuste 1).';

alter table public.content_performance_scores enable row level security;

create policy content_performance_scores_select_members
  on public.content_performance_scores for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.content_performance_scores to authenticated;

-- ── Configuração de pesos/limiares — mesma forma de radar_scoring_config:
-- centralizada no backend, nunca hardcoded/espalhada, workspace_id null =
-- linha global default. ──
create table public.performance_scoring_config (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  weight_reach numeric not null default 0.25,
  weight_engagement numeric not null default 0.25,
  weight_saves numeric not null default 0.25,
  weight_shares numeric not null default 0.25,
  winsorize_low_pct numeric not null default 0.05,
  winsorize_high_pct numeric not null default 0.95,
  -- Ajuste 1: 3 níveis configuráveis de cold start.
  min_sample_provisional integer not null default 5,
  min_sample_ready integer not null default 10,
  maturity_evolving_hours integer not null default 24,
  maturity_consolidated_days integer not null default 7,
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

insert into public.performance_scoring_config (workspace_id) values (null);

comment on table public.performance_scoring_config is 'Fase 10: pesos/limiares do performance_score, centralizados no backend (mesmo padrão de radar_scoring_config). workspace_id null = linha global default; override por workspace é suportado pelo schema mas não usado no MVP.';

alter table public.performance_scoring_config enable row level security;

create policy performance_scoring_config_select_authenticated
  on public.performance_scoring_config for select
  to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));

grant select on public.performance_scoring_config to authenticated;

-- ── Recomendações persistentes (facts determinísticos + interpretação
-- opcional por IA). source distingue insight 100% determinístico (sem
-- LLM, ajuste 7) de insight com síntese de IA. ──
create type public.performance_confidence as enum ('low', 'medium', 'high');
create type public.performance_insight_status as enum ('active', 'dismissed', 'expired');
create type public.performance_insight_source as enum ('deterministic', 'ai');
create type public.performance_insight_feedback as enum ('useful', 'not_useful');

create table public.performance_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  insight_type text not null,
  title text not null,
  description text not null,
  evidence jsonb not null,             -- únicos números que podem aparecer no texto (ajuste 7/item 18-20 do plano)
  sample_size integer not null,
  confidence public.performance_confidence not null,
  period_start date not null,
  period_end date not null,
  status public.performance_insight_status not null default 'active',
  source public.performance_insight_source not null,
  ai_generation_id uuid references public.ai_generations(id) on delete set null,
  fact_signature text not null,        -- hash determinístico dos facts subjacentes — evita regenerar o mesmo insight todo dia
  feedback public.performance_insight_feedback,
  dismissed_at timestamptz,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (workspace_id, fact_signature)
);

create index performance_insights_workspace_active_idx on public.performance_insights (workspace_id, status);

comment on table public.performance_insights is 'Fase 10: recomendações persistentes (ajuste 7 — prioriza determinístico; IA só para síntese/interpretação, nunca gera número livre — evidence é a única fonte de números). fact_signature evita duplicar o mesmo insight a cada rodada.';

alter table public.performance_insights enable row level security;

create policy performance_insights_select_members
  on public.performance_insights for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.performance_insights to authenticated;
-- Update (dismiss/feedback) só via RPC dedicada (próxima migration) — sem
-- policy de update direta para authenticated.

-- ── Observabilidade (separada de auditoria — ajuste já aprovado no plano). ──
create table public.performance_collection_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  publications_scheduled integer not null default 0,
  snapshots_attempted integer not null default 0,
  snapshots_collected integer not null default 0,
  retries integer not null default 0,
  rate_limited_count integer not null default 0,
  permission_blocked_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  duration_ms integer
);

comment on table public.performance_collection_runs is 'Fase 10: observabilidade de cada execução do collector global (mesma forma de pilot_runs/radar_runs) — não é auditoria de negócio, é operação.';

alter table public.performance_collection_runs enable row level security;
-- Tabela interna/operacional (não workspace-scoped) — sem policy de
-- select para authenticated, mesma postura de ai_generations/radar_runs
-- quando o dado não é diretamente do workspace do usuário final.
