-- =========================================================
-- CRÉDITOS — saldo + ledger append-only.
-- Nenhuma escrita direta é permitida via RLS: todo débito/crédito
-- passa pelas funções SECURITY DEFINER abaixo, que gravam o saldo
-- e o registro do ledger na mesma transação.
-- =========================================================
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credit_accounts enable row level security;

create trigger credit_accounts_set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

create policy "credit_accounts_select_members"
  on public.credit_accounts for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Sem policies de insert/update/delete para "authenticated": só as
-- funções SECURITY DEFINER (executadas como owner da tabela) escrevem aqui.

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.credit_accounts (id) on delete cascade,
  -- positivo = crédito concedido; negativo = consumo
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  operation text not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_ledger_workspace_id_idx on public.credit_ledger (workspace_id, created_at desc);
create index credit_ledger_account_id_idx on public.credit_ledger (account_id);

alter table public.credit_ledger enable row level security;

create policy "credit_ledger_select_members"
  on public.credit_ledger for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Ledger é append-only: nenhuma policy de update/delete é criada, e o
-- insert direto por "authenticated" também não é permitido — apenas
-- via função SECURITY DEFINER (que roda como owner da tabela).

-- Trava extra: mesmo contra bugs futuros, nunca permitir UPDATE/DELETE
-- no ledger, nem por engano dentro de uma função SECURITY DEFINER mal escrita.
create or replace function public.forbid_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'credit_ledger é append-only: % não é permitido.', tg_op;
end;
$$;

create trigger credit_ledger_forbid_update
  before update on public.credit_ledger
  for each row execute function public.forbid_ledger_mutation();

create trigger credit_ledger_forbid_delete
  before delete on public.credit_ledger
  for each row execute function public.forbid_ledger_mutation();

-- =========================================================
-- Funções de movimentação — atômicas (mesma transação grava
-- saldo + ledger). Chamadas via RPC pelo frontend/Edge Functions.
-- =========================================================
create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_operation text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts;
  v_new_balance bigint;
  v_ledger public.credit_ledger;
begin
  if p_amount <= 0 then
    raise exception 'p_amount deve ser positivo (quantidade a consumir).';
  end if;

  if not public.has_workspace_role(
    p_workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'Sem permissão para consumir créditos neste workspace.';
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  if v_account.balance < p_amount then
    raise exception 'Saldo de créditos insuficiente.';
  end if;

  v_new_balance := v_account.balance - p_amount;

  update public.credit_accounts
  set balance = v_new_balance
  where id = v_account.id;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after,
    operation, reference_type, reference_id, created_by, metadata
  ) values (
    p_workspace_id, v_account.id, -p_amount, v_new_balance,
    p_operation, p_reference_type, p_reference_id, auth.uid(), p_metadata
  )
  returning * into v_ledger;

  return v_ledger;
end;
$$;

create or replace function public.grant_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_operation text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts;
  v_new_balance bigint;
  v_ledger public.credit_ledger;
begin
  if p_amount <= 0 then
    raise exception 'p_amount deve ser positivo (quantidade a conceder).';
  end if;

  if not public.has_workspace_role(
    p_workspace_id, array['owner', 'admin']::public.workspace_role[]
  ) then
    raise exception 'Sem permissão para conceder créditos neste workspace.';
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  v_new_balance := v_account.balance + p_amount;

  update public.credit_accounts
  set balance = v_new_balance
  where id = v_account.id;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after,
    operation, reference_type, reference_id, created_by, metadata
  ) values (
    p_workspace_id, v_account.id, p_amount, v_new_balance,
    p_operation, p_reference_type, p_reference_id, auth.uid(), p_metadata
  )
  returning * into v_ledger;

  return v_ledger;
end;
$$;

comment on function public.consume_credits(uuid, bigint, text, text, uuid, jsonb) is
  'Debita créditos de forma atômica e registra o ledger. Falha se saldo insuficiente.';
comment on function public.grant_credits(uuid, bigint, text, text, uuid, jsonb) is
  'Concede créditos de forma atômica e registra o ledger. Restrito a owner/admin.';
