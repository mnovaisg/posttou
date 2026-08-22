-- =========================================================
-- CONTEÚDO — modelo já preparado para o editor visual (Fase 5),
-- mesmo que o editor ainda não exista.
-- =========================================================
create type public.content_type as enum ('post', 'carrossel', 'reel');
create type public.content_status as enum (
  'rascunho', 'em_revisao', 'aprovado', 'agendado', 'publicado', 'falhou'
);
create type public.content_format as enum ('1:1', '4:5', '9:16');
create type public.content_origin as enum ('manual', 'ia', 'radar', 'autopilot');
create type public.content_element_type as enum ('text', 'image', 'shape');

create table public.contents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null default 'Sem título',
  type public.content_type not null default 'post',
  status public.content_status not null default 'rascunho',
  format public.content_format not null default '4:5',
  origin public.content_origin not null default 'manual',
  caption text,
  hashtags text[] not null default '{}',
  cta text,
  created_by uuid references public.profiles (id) on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contents_workspace_id_idx on public.contents (workspace_id);
create index contents_workspace_status_idx on public.contents (workspace_id, status);
create index contents_scheduled_at_idx on public.contents (scheduled_at) where scheduled_at is not null;

alter table public.contents enable row level security;

create trigger contents_set_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents (id) on delete cascade,
  snapshot jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index content_versions_content_id_idx on public.content_versions (content_id);

alter table public.content_versions enable row level security;

create table public.content_pages (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents (id) on delete cascade,
  position int not null default 0,
  background_color text not null default '#ffffff',
  width int not null default 1080,
  height int not null default 1350,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, position)
);

create index content_pages_content_id_idx on public.content_pages (content_id);

alter table public.content_pages enable row level security;

create trigger content_pages_set_updated_at
  before update on public.content_pages
  for each row execute function public.set_updated_at();

create table public.content_elements (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.content_pages (id) on delete cascade,
  type public.content_element_type not null,
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  width numeric not null default 100,
  height numeric not null default 100,
  rotation numeric not null default 0,
  z_index int not null default 0,
  -- texto: { "value": "...", "fontFamily": "...", "fontSize": 24, "fontWeight": 400, "align": "left" }
  -- imagem: { "url": "...", "objectFit": "cover" }
  content jsonb not null default '{}'::jsonb,
  -- cor, opacidade, sombra, borda, etc.
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_elements_page_id_idx on public.content_elements (page_id);

alter table public.content_elements enable row level security;

create trigger content_elements_set_updated_at
  before update on public.content_elements
  for each row execute function public.set_updated_at();

-- =========================================================
-- Policies — leitura para todos os membros; escrita para
-- owner/admin/editor; approver e viewer somente leitura.
-- =========================================================
create policy "contents_select_members"
  on public.contents for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "contents_write_editors"
  on public.contents for all
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

create policy "content_versions_select_members"
  on public.content_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = content_versions.content_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "content_versions_write_editors"
  on public.content_versions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.contents c
      where c.id = content_versions.content_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    )
  );

create policy "content_pages_select_members"
  on public.content_pages for select
  to authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = content_pages.content_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "content_pages_write_editors"
  on public.content_pages for all
  to authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = content_pages.content_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    )
  )
  with check (
    exists (
      select 1 from public.contents c
      where c.id = content_pages.content_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    )
  );

create policy "content_elements_select_members"
  on public.content_elements for select
  to authenticated
  using (
    exists (
      select 1
      from public.content_pages p
      join public.contents c on c.id = p.content_id
      where p.id = content_elements.page_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "content_elements_write_editors"
  on public.content_elements for all
  to authenticated
  using (
    exists (
      select 1
      from public.content_pages p
      join public.contents c on c.id = p.content_id
      where p.id = content_elements.page_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.content_pages p
      join public.contents c on c.id = p.content_id
      where p.id = content_elements.page_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    )
  );
