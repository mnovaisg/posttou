-- Fase 9 — Piloto Automático: schema base.
-- Reaproveita content_origin='autopilot' (já existe, Fase 3) e
-- content_type/workspace_role (Fase 1/3) — nenhum enum de conteúdo é
-- duplicado. pilot_mode contém SOMENTE 'assisted' e 'semi_auto' nesta
-- fase (ajuste 1 da aprovação): 'autonomous' só entra via migration
-- futura, quando o produto realmente suportar.
create type public.pilot_status as enum ('disabled', 'active', 'paused');
create type public.pilot_mode as enum ('assisted', 'semi_auto');
create type public.pilot_plan_status as enum ('draft', 'awaiting_approval', 'approved', 'generating', 'completed', 'cancelled');
create type public.pilot_plan_item_status as enum ('planned', 'approved', 'generating', 'generated', 'skipped', 'failed');
-- Ajuste 5: papel editorial (fixo, do produto) é distinto do pilar da
-- marca (livre, vem de brand_profiles.content_strategy.priority_themes).
-- Nunca duplicamos o DNA — o pilar continua sendo texto livre lido de lá.
create type public.pilot_editorial_role as enum ('educativo', 'autoridade', 'relacionamento', 'venda');

create table public.pilot_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  status public.pilot_status not null default 'disabled',
  mode public.pilot_mode not null default 'assisted',
  planning_window_days integer not null default 7 check (planning_window_days between 3 and 14),
  max_posts_per_window integer not null default 3 check (max_posts_per_window between 1 and 14),
  allowed_weekdays integer[] not null default '{1,3,5}',
  preferred_times jsonb not null default '{"default":"18:00"}',
  allowed_formats public.content_type[] not null default '{post,carrossel}',
  editorial_mix jsonb not null default '{"educativo":40,"autoridade":20,"relacionamento":20,"venda":20}',
  use_radar boolean not null default false,
  max_radar_per_window integer not null default 1 check (max_radar_per_window >= 0),
  radar_min_opportunity_score numeric not null default 60 check (radar_min_opportunity_score between 0 and 100),
  radar_min_confidence text not null default 'medium' check (radar_min_confidence in ('medium', 'high')),
  temporary_objective text,
  temporary_objective_expires_at timestamptz,
  default_instagram_account_id uuid references public.instagram_accounts(id) on delete set null,
  max_credits_per_window bigint check (max_credits_per_window is null or max_credits_per_window > 0), -- ajuste 6: guard-rail financeiro real
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pilot_settings is 'Configuração do Piloto Automático por workspace (Fase 9). status=disabled nunca é alterado automaticamente na criação do workspace (item 78).';
comment on column public.pilot_settings.allowed_formats is 'Nunca inclui reel nesta fase — validado no backend (RPC), não confiar apenas na UI.';
comment on column public.pilot_settings.editorial_mix is 'Chaves fixas: educativo/autoridade/relacionamento/venda (papel editorial do produto) — distinto do pilar da marca, que vem de brand_profiles e nunca é duplicado aqui (ajuste 5).';
comment on column public.pilot_settings.max_credits_per_window is 'Orçamento máximo de créditos que o Piloto pode consumir na janela de planejamento atual, combinado com o saldo real (ajuste 6) — NULL = sem teto próprio além do saldo da conta.';

create table public.pilot_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generation_key text not null unique, -- workspace_id:period_start — rastreabilidade explícita (ajuste 3)
  period_start date not null,
  period_end date not null,
  status public.pilot_plan_status not null default 'draft',
  mode public.pilot_mode not null, -- snapshot de pilot_settings.mode no momento da geração
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  superseded_by uuid references public.pilot_plans(id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Ajuste 3: no máximo 1 plano NÃO-terminal por workspace, independente de
-- period_start — mais forte que unique(workspace_id, period_start), que
-- não impediria janelas sobrepostas geradas por corridas diferentes.
create unique index pilot_plans_one_active_per_workspace_idx on public.pilot_plans (workspace_id) where status in ('draft', 'awaiting_approval', 'approved', 'generating');
comment on table public.pilot_plans is 'Plano editorial de uma janela rolante (Fase 9). Nunca mais de um plano ativo por workspace ao mesmo tempo (pilot_plans_one_active_per_workspace_idx) — garantido por claim_pilot_workspace_for_planning (advisory lock + este índice).';

create table public.pilot_plan_items (
  id uuid primary key default gen_random_uuid(),
  pilot_plan_id uuid not null references public.pilot_plans(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade, -- denormalizado para RLS/índice direto (mesmo padrão de radar_opportunities)
  scheduled_for timestamptz not null,
  editorial_role public.pilot_editorial_role not null,
  brand_pillar text, -- livre, resolvido a partir de brand_profiles.content_strategy.priority_themes — nunca um enum próprio
  objective text,
  format public.content_type not null,
  topic text not null,
  angle text,
  reason text,
  radar_opportunity_id uuid references public.radar_opportunities(id),
  content_id uuid references public.contents(id) on delete set null,
  status public.pilot_plan_item_status not null default 'planned',
  source text not null default 'pilot' check (source in ('pilot', 'manual')),
  status_reason text, -- motivo de skip ('recently_covered', 'slot_conflict', ...) ou de failed
  rejection_feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pilot_plan_items_slot_idx on public.pilot_plan_items (pilot_plan_id, scheduled_for);
create index pilot_plan_items_workspace_slot_idx on public.pilot_plan_items (workspace_id, scheduled_for) where status not in ('skipped', 'failed');
comment on table public.pilot_plan_items is 'Item planejado (Fase 9). Conflito de slot é validado contra TODO o sistema (outros planos + contents.scheduled_at manual/já agendado) via pilot_check_slot_conflict(), não só dentro deste plano (ajuste 4).';

create table public.pilot_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_type text not null check (run_type in ('plan_generation', 'content_generation')),
  status text not null default 'running' check (status in ('running', 'success', 'partial_failure', 'failed')),
  plan_id uuid references public.pilot_plans(id),
  slots_evaluated integer not null default 0,
  items_created integer not null default 0,
  contents_generated integer not null default 0,
  radar_used integer not null default 0,
  ai_calls integer not null default 0,
  credits_consumed bigint not null default 0,
  estimated_ai_cost jsonb not null default '{}', -- mesmo formato de radar_runs.ai_usage: {input_tokens, output_tokens, estimated_cost_usd}
  error_summary text,
  duration_ms integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.pilot_runs is 'Observabilidade de cada execução do Piloto (planejamento ou geração), por workspace (Fase 9).';

alter table public.contents add column pilot_plan_item_id uuid references public.pilot_plan_items(id) on delete set null;
comment on column public.contents.pilot_plan_item_id is 'Rastreabilidade: conteúdo criado pelo Piloto Automático (origin=autopilot) a partir deste item de plano. Pode coexistir com radar_opportunity_id quando o item veio do Radar.';

-- RLS: tudo workspace-scoped. Toda escrita passa por RPC SECURITY DEFINER
-- (nunca UPDATE/INSERT direto do frontend) — mesmo princípio da Fase 7/8.
alter table public.pilot_settings enable row level security;
alter table public.pilot_plans enable row level security;
alter table public.pilot_plan_items enable row level security;
alter table public.pilot_runs enable row level security;

create policy "pilot_settings_select_members" on public.pilot_settings for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "pilot_plans_select_members" on public.pilot_plans for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "pilot_plan_items_select_members" on public.pilot_plan_items for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "pilot_runs_select_members" on public.pilot_runs for select to authenticated using (public.is_workspace_member(workspace_id));

grant select on public.pilot_settings, public.pilot_plans, public.pilot_plan_items, public.pilot_runs to authenticated;
