-- Fase 12 — DNA Visual estruturado e versionado (itens 11, 21, 24).
-- Vocabulário fixo por atributo, validado no backend (edge function) antes
-- de persistir — nunca prosa livre da IA. Preview não vira `contents`
-- (item 20) — vive só nestas tabelas + content-assets/visual-dna/.

create type public.visual_dna_option_set_status as enum ('generating', 'ready', 'failed', 'dismissed');
create type public.visual_dna_option_status as enum ('pending', 'generated', 'failed');

create table public.visual_dna_option_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.visual_dna_option_set_status not null default 'generating',
  status_reason text,

  round_number integer not null,          -- item 1: conta rodadas reais do workspace, nunca resetável
  credit_cost integer not null default 0, -- 0 nas 2 primeiras rodadas, 45 a partir da 3ª
  credit_ledger_id uuid references public.credit_ledger(id),

  -- Base criativa COMPARTILHADA pelas 3 opções (ajuste 2): mesmo tema/
  -- mensagem/objetivo, só o tratamento visual varia.
  shared_brief jsonb,
  reference_snapshot jsonb not null default '[]'::jsonb,  -- quais referências (id+handle) influenciaram esta rodada
  prompt_version text not null default 'v1',

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Item 54: nunca 2 rodadas "generating" ao mesmo tempo no mesmo workspace.
create unique index visual_dna_option_sets_one_generating_idx
  on public.visual_dna_option_sets (workspace_id)
  where status = 'generating';

create index visual_dna_option_sets_workspace_idx on public.visual_dna_option_sets (workspace_id, created_at desc);

comment on table public.visual_dna_option_sets is 'Fase 12: 1 rodada de geração das 3 direções visuais. round_number conta TODAS as rodadas já criadas pro workspace (nunca decrementado/resetado por deleção) — base da política de gratuidade (ajuste 1).';

alter table public.visual_dna_option_sets enable row level security;
create policy visual_dna_option_sets_select_members on public.visual_dna_option_sets for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.visual_dna_option_sets to authenticated;

create table public.visual_dna_options (
  id uuid primary key default gen_random_uuid(),
  option_set_id uuid not null references public.visual_dna_option_sets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null check (label in ('A', 'B', 'C')),

  attributes jsonb,           -- {visual_direction, visual_hierarchy, composition_style, text_density, contrast_level, image_role, graphic_density, spacing_style, typography_direction, tone_visual} — vocabulário fixo, validado no backend
  attributes_summary text,    -- resumo curto pra UI (ex.: "títulos fortes, pouco texto, contraste elevado")

  ai_generation_id uuid references public.ai_generations(id),
  preview_asset_path text,
  status public.visual_dna_option_status not null default 'pending',

  created_at timestamptz not null default now(),
  unique (option_set_id, label)
);

create index visual_dna_options_set_idx on public.visual_dna_options (option_set_id);

comment on table public.visual_dna_options is 'Fase 12: as 3 opções (A/B/C) de uma rodada — mesma mensagem/tema (shared_brief no option_set), variando só atributos visuais. attributes usa vocabulário fixo validado no backend, nunca A/B/C isolado.';

alter table public.visual_dna_options enable row level security;
create policy visual_dna_options_select_members on public.visual_dna_options for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.visual_dna_options to authenticated;

create table public.brand_visual_dna (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null,

  based_on_option_id uuid references public.visual_dna_options(id),
  reference_ids uuid[] not null default '{}',   -- proveniência simplificada (ajuste 7): sem rastreio por atributo

  attributes jsonb not null,   -- mesma forma de visual_dna_options.attributes, mas editável pelo usuário (itens 23/26)
  status text not null default 'active' check (status in ('active', 'superseded')),

  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  unique (workspace_id, version)
);

-- 1 versão "active" por workspace (mesmo padrão de pilot_plans/strategy_experiments).
create unique index brand_visual_dna_one_active_idx on public.brand_visual_dna (workspace_id) where status = 'active';

comment on table public.brand_visual_dna is 'Fase 12: DNA visual CONFIRMADO e versionado (item 21) — nunca sobrescreve, sempre nova versão. status=not_configured é representado pela AUSÊNCIA de linha active, nunca uma linha falsa.';

alter table public.brand_visual_dna enable row level security;
create policy brand_visual_dna_select_members on public.brand_visual_dna for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.brand_visual_dna to authenticated;

create table public.visual_dna_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  option_set_id uuid references public.visual_dna_option_sets(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  images_attempted integer not null default 0,
  images_succeeded integer not null default 0,
  credit_cost integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  duration_ms integer
);

create index visual_dna_generation_runs_workspace_idx on public.visual_dna_generation_runs (workspace_id, started_at desc);

comment on table public.visual_dna_generation_runs is 'Fase 12: observabilidade de cada rodada de geração (item 48) — não é auditoria de negócio.';

alter table public.visual_dna_generation_runs enable row level security;
create policy visual_dna_generation_runs_select_members on public.visual_dna_generation_runs for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.visual_dna_generation_runs to authenticated;
