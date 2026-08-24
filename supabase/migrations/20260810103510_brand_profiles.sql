-- =========================================================
-- DNA DA MARCA — contexto persistente usado por toda geração de IA futura.
-- Uma linha por workspace. Seções estruturadas em jsonb (audience,
-- content_strategy, voice, vocabulary, visual_identity) para não exigir
-- alterações de schema conforme o formulário evolui — o formato interno de
-- cada jsonb é validado/normalizado na camada de aplicação
-- (src/features/brand-dna/brandContext.ts), não no banco.
-- =========================================================
create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,

  -- Etapa 1 — Sua Marca
  company_name text,
  primary_language text not null default 'pt-BR',
  description text,
  segment text,
  location text,
  website text,
  instagram_handle text,
  products text,
  services text,
  differentiators text,
  problems_solved text,

  -- Etapa 2 — Público
  -- { age_range, gender, location, interests[], needs[], pains[], desires[],
  --   objections[], buying_behavior, knowledge_level }
  audience jsonb not null default '{}'::jsonb,

  -- Etapa 3 — Estratégia de conteúdo
  -- { priority_themes[], secondary_themes[], preferred_formats[], objectives[],
  --   topics_to_cover[], topics_to_avoid[] }
  content_strategy jsonb not null default '{}'::jsonb,

  -- Etapa 4 — Voz e personalidade
  -- { formality, tone, complexity, personal_institutional (0-100 cada),
  --   personality_traits[] }
  voice jsonb not null default '{}'::jsonb,

  -- Vocabulário e preferências de comunicação
  -- { preferred_words[], forbidden_words[], preferred_cta, emoji_usage,
  --   emoji_intensity, hashtag_usage, hashtag_style, signature_expressions[] }
  vocabulary jsonb not null default '{}'::jsonb,

  -- Etapa 5 — Identidade visual
  -- { colors[], typography, visual_style, references[] }
  visual_identity jsonb not null default '{}'::jsonb,
  logo_url text,
  secondary_logo_url text,
  avatar_url text,

  -- Progresso do wizard: permite "continuar depois"
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 6),
  onboarding_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_profiles_workspace_id_idx on public.brand_profiles (workspace_id);

alter table public.brand_profiles enable row level security;

create trigger brand_profiles_set_updated_at
  before update on public.brand_profiles
  for each row execute function public.set_updated_at();

-- Mesmo padrão de permissão do modelo de conteúdo: todo membro lê,
-- owner/admin/editor escrevem, approver/viewer só leem.
create policy "brand_profiles_select_members"
  on public.brand_profiles for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "brand_profiles_write_editors"
  on public.brand_profiles for all
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

grant select, insert, update, delete on public.brand_profiles to authenticated;
