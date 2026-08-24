-- Fase 14C — gestão de equipe. Reaproveita 100% da estrutura de roles já
-- existente (workspace_members.role, has_workspace_role, proteção contra
-- remoção do último owner) — nenhuma segunda estrutura de permissões.
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null,
  invited_by uuid not null references auth.users(id),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

create index idx_organization_invites_org_pending on public.organization_invites(organization_id) where status = 'pending';
create index idx_organization_invites_email on public.organization_invites(lower(email));

alter table public.organization_invites enable row level security;

create policy organization_invites_select_members on public.organization_invites for select to authenticated
  using (public.is_organization_member(organization_id));

-- Nenhuma policy de insert/update/delete: toda escrita passa por RPCs
-- security definer, que fazem a checagem de papel/limite/lock.

comment on table public.organization_invites is 'Fase 14C: convites de equipe. token_hash guarda sha256 do token enviado por e-mail — o token bruto nunca é persistido.';
