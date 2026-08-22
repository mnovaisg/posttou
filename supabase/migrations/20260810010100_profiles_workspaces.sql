-- =========================================================
-- PROFILES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- (select auth.uid()) em vez de auth.uid() puro: permite ao planner do
-- Postgres cachear o valor por statement em vez de reavaliar por linha.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =========================================================
-- WORKSPACES
-- =========================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null unique,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_owner_id_idx on public.workspaces (owner_id);

alter table public.workspaces enable row level security;

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- =========================================================
-- WORKSPACE MEMBERS
-- =========================================================
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'approver', 'viewer');

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

alter table public.workspace_members enable row level security;

create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function public.set_updated_at();

-- =========================================================
-- Helpers de autorização (SECURITY DEFINER — evita recursão de RLS)
-- =========================================================
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns public.workspace_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles public.workspace_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = any (p_roles)
  );
$$;

comment on function public.is_workspace_member(uuid) is 'True se o usuário autenticado pertence ao workspace.';
comment on function public.has_workspace_role(uuid, public.workspace_role[]) is 'True se o usuário autenticado tem um dos papéis informados no workspace.';

-- =========================================================
-- Policies de workspaces (dependem dos helpers acima)
-- =========================================================
create policy "workspaces_select_member"
  on public.workspaces for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "workspaces_update_owner_admin"
  on public.workspaces for update
  to authenticated
  using (public.has_workspace_role(id, array['owner', 'admin']::public.workspace_role[]))
  with check (public.has_workspace_role(id, array['owner', 'admin']::public.workspace_role[]));

-- Criação de workspace é feita pela função handle_new_user (SECURITY DEFINER);
-- não há política de INSERT para authenticated aqui de propósito.

-- =========================================================
-- Policies de workspace_members
-- =========================================================
create policy "workspace_members_select_peers"
  on public.workspace_members for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "workspace_members_manage_owner_admin"
  on public.workspace_members for all
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

-- Impede remover/rebaixar o último owner do workspace
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners int;
  workspace_still_exists boolean;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then

    -- Se o workspace já não existe mais (DELETE em cascata a partir de
    -- "workspaces"), não há o que proteger: o workspace inteiro está
    -- sendo removido, não apenas o owner.
    select exists (select 1 from public.workspaces where id = old.workspace_id) into workspace_still_exists;

    if workspace_still_exists then
      select count(*) into remaining_owners
      from public.workspace_members
      where workspace_id = old.workspace_id
        and role = 'owner'
        and id <> old.id;

      if remaining_owners = 0 then
        raise exception 'O workspace precisa de ao menos um owner.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger workspace_members_prevent_last_owner
  before update or delete on public.workspace_members
  for each row execute function public.prevent_last_owner_removal();

-- membros de um mesmo workspace podem ver o nome/avatar uns dos outros
-- (definida aqui, após workspace_members existir, para evitar referência para frente)
create policy "profiles_select_workspace_peers"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm1
      join public.workspace_members wm2 on wm2.workspace_id = wm1.workspace_id
      where wm1.user_id = (select auth.uid())
        and wm2.user_id = profiles.id
    )
  );
