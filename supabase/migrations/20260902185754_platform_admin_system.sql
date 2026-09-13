
-- Bloco 11.1: Área Administrativa do POSTTOU (autorização de plataforma,
-- distinta de qualquer papel de workspace).

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- Sem policies: acesso só via service_role ou funções SECURITY DEFINER
-- abaixo. Nenhum client comum consegue ler ou escrever esta tabela
-- diretamente, mesmo autenticado.

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists(select 1 from public.platform_admins where user_id = p_user_id);
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated;

-- Bootstrap do primeiro platform admin — inserção direta, nunca via RPC
-- alcançável por cliente (não existe grant/revoke exposto a authenticated).
insert into public.platform_admins (user_id, granted_by)
values ('5d1c7418-a104-4906-8c92-b005aa5c6750', '5d1c7418-a104-4906-8c92-b005aa5c6750')
on conflict (user_id) do nothing;

-- ── Bug de segurança pré-existente encontrado nesta auditoria ──
-- A policy de leitura de audit_logs permitia a QUALQUER usuário
-- autenticado ler todas as linhas com workspace_id IS NULL (a policy dizia
-- "workspace_id IS NULL OR tem papel no workspace" — o "OR" tornava as
-- linhas workspace-agnósticas públicas para qualquer logado). Isto teria
-- exposto os logs de auditoria administrativa (ações de platform admin
-- sobre cupons) que este bloco está prestes a começar a gravar. Corrigido
-- para exigir is_platform_admin() nas linhas sem workspace.
drop policy if exists audit_logs_select_owner_admin on public.audit_logs;
create policy audit_logs_select_owner_admin on public.audit_logs
  for select
  using (
    (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner'::workspace_role, 'admin'::workspace_role]))
    or (workspace_id is null and public.is_platform_admin())
  );
