-- Fase 12 — Referências da Marca. Reaproveita a Business Discovery já
-- existente (Fase 6, business-discovery-provider.ts) — nenhum novo
-- mecanismo de acesso à Meta. Referência manual funciona sem nenhuma
-- análise automática (item 4 da missão) — nunca inventamos característica
-- de um perfil não analisado.
create type public.brand_reference_status as enum (
  'manual', 'analysis_pending', 'analyzed', 'permission_required', 'unavailable'
);

create table public.brand_reference_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  handle text not null,
  ig_user_id text,                      -- item 43: ID estável da Meta quando disponível (análise oficial)
  reference_type text,                  -- 'concorrente'|'inspiracao'|'marca_admirada'|'referencia_visual'|'referencia_conteudo' — opcional
  liked_aspects text[] not null default '{}',  -- subconjunto de: visual, tom_de_voz, temas, carrosseis, forma_de_comunicar, posicionamento
  notes text,

  status public.brand_reference_status not null default 'manual',
  -- Só dados permitidos/derivados (nunca legenda integral — ver item 7):
  -- {biography, website, followers_count, media_count, format_distribution,
  --  avg_posts_per_week, avg_like_count, avg_comments_count, fields_availability}
  analysis jsonb,
  analyzed_at timestamptz,
  analysis_error_code text,

  removed_at timestamptz,               -- soft-delete (item 42): histórico de DNA que já usou a referência continua íntegro
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brand_reference_liked_aspects_valid check (
    liked_aspects <@ array['visual', 'tom_de_voz', 'temas', 'carrosseis', 'forma_de_comunicar', 'posicionamento']::text[]
  ),
  constraint brand_reference_type_valid check (
    reference_type is null or reference_type in ('concorrente', 'inspiracao', 'marca_admirada', 'referencia_visual', 'referencia_conteudo')
  )
);

-- Até 5 referências ativas por workspace (item 2 — auditado como limite
-- razoável: espaço suficiente pra variedade sem inchar o prompt).
create unique index brand_reference_profiles_workspace_handle_active_idx
  on public.brand_reference_profiles (workspace_id, lower(handle))
  where removed_at is null;

create index brand_reference_profiles_workspace_idx on public.brand_reference_profiles (workspace_id) where removed_at is null;

comment on table public.brand_reference_profiles is 'Fase 12: perfis de referência declarados pelo workspace. Referência manual funciona sem análise (item 4). Análise automática só ocorre mediante ação explícita do usuário (consentimento — ajuste 3), nunca no momento de adicionar.';

alter table public.brand_reference_profiles enable row level security;

create policy brand_reference_profiles_select_members
  on public.brand_reference_profiles for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.brand_reference_profiles to authenticated;
-- Escrita só via RPCs SECURITY DEFINER abaixo (owner/admin only — ajuste 4).
