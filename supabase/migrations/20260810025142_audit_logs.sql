-- =========================================================
-- AUDITORIA — registro de ações importantes.
-- Inserção só acontece via função SECURITY DEFINER, garantindo que
-- user_id sempre reflete auth.uid() real (nunca um valor enviado pelo cliente).
-- =========================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_workspace_id_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_action_idx on public.audit_logs (action);

alter table public.audit_logs enable row level security;

-- Apenas owner/admin do workspace podem ver a trilha de auditoria.
create policy "audit_logs_select_owner_admin"
  on public.audit_logs for select
  to authenticated
  using (
    workspace_id is null
    or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
  );

-- Sem policy de insert/update/delete para "authenticated": apenas a
-- função log_audit_event (SECURITY DEFINER) grava aqui, e o log nunca é editável.
create or replace function public.forbid_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_logs é somente-leitura para clientes: % não é permitido.', tg_op;
end;
$$;

create trigger audit_logs_forbid_update
  before update on public.audit_logs
  for each row execute function public.forbid_audit_mutation();

create trigger audit_logs_forbid_delete
  before delete on public.audit_logs
  for each row execute function public.forbid_audit_mutation();

create or replace function public.log_audit_event(
  p_workspace_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.audit_logs;
begin
  if p_workspace_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem permissão para registrar auditoria neste workspace.';
  end if;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (p_workspace_id, auth.uid(), p_action, p_resource_type, p_resource_id, p_metadata)
  returning * into v_log;

  return v_log;
end;
$$;

comment on function public.log_audit_event(uuid, text, text, uuid, jsonb) is
  'Registra um evento de auditoria com user_id derivado de auth.uid() (nunca confiado do cliente).';
