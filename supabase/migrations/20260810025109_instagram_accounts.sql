-- =========================================================
-- INSTAGRAM — um workspace pode ter múltiplas contas conectadas.
-- A conexão real (OAuth/Graph API) é implementada na Fase 6;
-- aqui só existe a estrutura, sem dados simulados.
-- =========================================================
create type public.instagram_account_status as enum (
  'conectado', 'token_expirado', 'desconectado', 'erro'
);

create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ig_user_id text not null,
  username text,
  status public.instagram_account_status not null default 'desconectado',
  -- token nunca é lido/gravado pelo frontend: apenas Edge Functions com
  -- service role tocam esta coluna.
  access_token_encrypted text,
  token_expires_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, ig_user_id)
);

create index instagram_accounts_workspace_id_idx on public.instagram_accounts (workspace_id);

alter table public.instagram_accounts enable row level security;

create trigger instagram_accounts_set_updated_at
  before update on public.instagram_accounts
  for each row execute function public.set_updated_at();

create policy "instagram_accounts_select_members"
  on public.instagram_accounts for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "instagram_accounts_manage_owner_admin"
  on public.instagram_accounts for all
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

-- Nunca expor o token cifrado ao cliente, mesmo para quem tem select.
-- IMPORTANTE: GRANT de tabela inteira sempre prevalece sobre REVOKE de
-- coluna no Postgres — por isso instagram_accounts é a ÚNICA tabela que
-- NÃO recebe "grant select/insert/update on <tabela> to authenticated"
-- na migration de grants genéricos. Em vez disso, concedemos aqui apenas
-- as colunas permitidas; access_token_encrypted nunca é concedida a
-- authenticated/anon, só a service_role (usado pelas Edge Functions da
-- Fase 6). A autorização por linha continua vindo das policies de RLS acima.
grant select (
  id, workspace_id, ig_user_id, username, status,
  token_expires_at, connected_by, created_at, updated_at
) on public.instagram_accounts to authenticated;
grant insert (workspace_id, ig_user_id, username, status, connected_by) on public.instagram_accounts to authenticated;
grant update (username, status, connected_by) on public.instagram_accounts to authenticated;
grant delete on public.instagram_accounts to authenticated;

create table public.instagram_publications (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents (id) on delete cascade,
  instagram_account_id uuid not null references public.instagram_accounts (id) on delete cascade,
  ig_media_id text,
  status public.content_status not null default 'agendado',
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index instagram_publications_content_id_idx on public.instagram_publications (content_id);
create index instagram_publications_account_id_idx on public.instagram_publications (instagram_account_id);

alter table public.instagram_publications enable row level security;

create trigger instagram_publications_set_updated_at
  before update on public.instagram_publications
  for each row execute function public.set_updated_at();

create policy "instagram_publications_select_members"
  on public.instagram_publications for select
  to authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = instagram_publications.content_id
        and public.is_workspace_member(c.workspace_id)
    )
  );
