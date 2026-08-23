-- Fase 11 — Otimização Inteligente & Experimentos: schema.
--
-- Princípio central: dado real (Fase 10) -> recomendação estruturada ->
-- humano aprova -> Piloto se adapta no PRÓXIMO planejamento. Nunca
-- LLM -> pilot_settings UPDATE direto. strategy_recommendations é
-- deliberadamente separada de performance_insights: insight é uma
-- observação (read-only); recomendação é uma proposta de mutação
-- estruturada com ciclo de vida de aplicação/rollback.

create type public.strategy_recommendation_type as enum ('settings_change', 'experiment_suggestion', 'informational');
create type public.strategy_recommendation_status as enum ('proposed', 'accepted', 'dismissed', 'expired', 'reverted');

create table public.strategy_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  insight_id uuid references public.performance_insights(id) on delete set null,

  recommendation_type public.strategy_recommendation_type not null,
  fact jsonb not null,             -- números crus (avg_score, delta_pct, sample_size...) — única fonte de verdade
  interpretation text not null,    -- texto determinístico (template), nunca LLM nesta fase

  -- Só preenchido quando recommendation_type='settings_change'. target
  -- validado contra allowlist no backend (nunca confiado do cliente/IA).
  target text,
  operation text,
  before jsonb,
  after jsonb,

  evidence jsonb not null,
  sample_size integer not null,
  confidence public.performance_confidence not null,
  period_start date not null,
  period_end date not null,

  fingerprint text not null,       -- dedup determinístico (ajuste 50 do plano)
  priority_score numeric not null default 0,

  status public.strategy_recommendation_status not null default 'proposed',
  status_reason text,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  applied_at timestamptz,
  applied_by uuid references public.profiles(id),
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id),
  dismiss_reason text,

  unique (workspace_id, fingerprint)
);

create index strategy_recommendations_workspace_status_idx on public.strategy_recommendations (workspace_id, status);

comment on table public.strategy_recommendations is 'Fase 11: recomendações estruturadas nascidas de compute_performance_facts (Fase 10). fact/evidence são a única fonte de número; interpretation é template determinístico. Aplicação/rollback via RPC com optimistic lock (before/after vs. valor atual real).';

alter table public.strategy_recommendations enable row level security;

create policy strategy_recommendations_select_members
  on public.strategy_recommendations for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.strategy_recommendations to authenticated;
-- Sem policy de insert/update/delete: escrita só via service_role (gerador)
-- ou RPCs SECURITY DEFINER dedicadas (apply/revert/dismiss).

-- ── Experimentos editoriais ──────────────────────────────────────────
create type public.strategy_experiment_status as enum ('draft', 'active', 'completed', 'cancelled', 'inconclusive');

create table public.strategy_experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recommendation_id uuid references public.strategy_recommendations(id) on delete set null,

  hypothesis text not null,
  dimension text not null,          -- ex.: 'editorial_role', 'format', 'origin'
  variant jsonb not null,           -- ex.: {"editorial_role":"educativo","format":"carrossel"}

  period_start date not null,
  period_end date not null,
  target_sample_size integer not null check (target_sample_size > 0),
  actual_sample_size integer not null default 0,

  -- Congelados no início (ajuste 29 do plano) — nunca recalculados
  -- retroativamente para mudar a régua no final.
  baseline_definition jsonb not null,
  success_criteria jsonb not null,

  status public.strategy_experiment_status not null default 'draft',
  result jsonb,
  confidence public.performance_confidence,

  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Item 24 do plano: no máximo 1 experimento NÃO-TERMINAL por workspace —
-- mesmo padrão de pilot_plans_one_active_per_workspace_idx.
create unique index strategy_experiments_one_active_per_workspace_idx
  on public.strategy_experiments (workspace_id)
  where status in ('draft', 'active');

create index strategy_experiments_workspace_status_idx on public.strategy_experiments (workspace_id, status);

comment on table public.strategy_experiments is 'Fase 11: teste editorial controlado, como overlay TEMPORÁRIO sobre o planner do Piloto — nunca altera pilot_settings permanentemente. Máximo 1 não-terminal por workspace (índice parcial único).';

alter table public.strategy_experiments enable row level security;

create policy strategy_experiments_select_members
  on public.strategy_experiments for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.strategy_experiments to authenticated;

-- ── Rastreabilidade experimento -> conteúdo, via o próprio Piloto (item
-- 22: nunca duplicar pipeline de geração). Não existe tabela-ponte —
-- contents.pilot_plan_item_id já encadeia até aqui. ──
alter table public.pilot_plan_items
  add column experiment_id uuid references public.strategy_experiments(id) on delete set null;

comment on column public.pilot_plan_items.experiment_id is 'Fase 11: setado pelo planner (nunca pela IA) quando este item foi gerado para preencher a amostra de um experimento ativo. Rastreabilidade completa via contents.pilot_plan_item_id -> pilot_plan_items.experiment_id, sem tabela-ponte.';

-- ── Observabilidade obrigatória (não é auditoria de negócio) — 1 linha
-- por workspace avaliado em cada execução do gerador de recomendações. ──
create table public.strategy_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidates_evaluated integer not null default 0,
  recommendations_created integer not null default 0,
  deduplicated integer not null default 0,
  skipped_low_sample integer not null default 0,
  stale_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  duration_ms integer
);

create index strategy_recommendation_runs_workspace_idx on public.strategy_recommendation_runs (workspace_id, started_at desc);

comment on table public.strategy_recommendation_runs is 'Fase 11: observabilidade de cada avaliação do gerador de recomendações por workspace (mesma forma de pilot_runs/performance_collection_runs) — não é auditoria de negócio.';

alter table public.strategy_recommendation_runs enable row level security;

create policy strategy_recommendation_runs_select_members
  on public.strategy_recommendation_runs for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.strategy_recommendation_runs to authenticated;
