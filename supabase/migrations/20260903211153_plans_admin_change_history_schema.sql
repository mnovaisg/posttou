-- Bloco: Planos & Preços — histórico abrangente de alterações (preço
-- mensal, anual, percentual, ajuste em massa, restauração, rename), não
-- só "price history". Deny-all RLS: toda leitura/escrita passa por
-- RPCs admin_*_system, nunca policy de cliente.
create table public.plan_change_history (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.plans(id),
  change_type text not null check (change_type in ('price_manual', 'price_percent', 'price_bulk', 'price_restore', 'rename', 'rename_restore')),
  field text not null check (field in ('monthly', 'yearly', 'monthly_and_yearly', 'name')),
  previous_monthly_cents integer,
  new_monthly_cents integer,
  previous_yearly_cents integer,
  new_yearly_cents integer,
  previous_name text,
  new_name text,
  percent_applied numeric,
  rounding_rule text check (rounding_rule in ('exact', 'integer', 'commercial_9')),
  note text,
  batch_id uuid,
  restored_from_history_id uuid references public.plan_change_history(id),
  admin_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index plan_change_history_plan_id_idx on public.plan_change_history (plan_id, created_at desc);
create index plan_change_history_batch_id_idx on public.plan_change_history (batch_id) where batch_id is not null;

comment on table public.plan_change_history is 'Histórico append-only de qualquer alteração administrativa em plans (preço mensal/anual, percentual, ajuste em massa, restauração, rename). Escrita exclusiva via RPCs admin_*_system.';

alter table public.plan_change_history enable row level security;
-- Sem policies: nenhum acesso direto de anon/authenticated, nem do dono
-- da linha. Leitura só via admin_list_plan_change_history_system.

revoke all on public.plan_change_history from anon, authenticated;

-- Trigger equivalente ao forbid_audit_mutation de audit_logs: histórico
-- nunca é editado ou apagado, só inserido (pelas RPCs, como service
-- definer, que também ignoram RLS mas ainda podem ser pegas pelo
-- trigger caso alguém tente UPDATE/DELETE por engano).
create or replace function public._forbid_plan_change_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PLAN_CHANGE_HISTORY_IS_APPEND_ONLY';
end;
$$;

create trigger forbid_plan_change_history_mutation
  before update or delete on public.plan_change_history
  for each row execute function public._forbid_plan_change_history_mutation();
