-- Fase 14B — organization -> subscription -> workspaces, planos e franquia.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspaces
  add column organization_id uuid references public.organizations(id);

-- Backfill: cada workspace existente ganha sua própria organization 1:1,
-- dona = owner atual do workspace. Preserva 100% dos dados existentes.
insert into public.organizations (id, name, owner_user_id)
select gen_random_uuid(), w.name, w.owner_id
from public.workspaces w
where w.organization_id is null;

update public.workspaces w
set organization_id = o.id
from public.organizations o
where w.organization_id is null and o.owner_user_id = w.owner_id and o.name = w.name
  and o.id not in (select organization_id from public.workspaces where organization_id is not null and id <> w.id);

-- fallback determinístico para eventuais duplicidades de name+owner: casa por linha via CTE ordenado
with to_fix as (
  select w.id as workspace_id
  from public.workspaces w
  where w.organization_id is null
)
insert into public.organizations (id, name, owner_user_id)
select gen_random_uuid(), w.name, w.owner_id
from public.workspaces w join to_fix t on t.workspace_id = w.id;

update public.workspaces w
set organization_id = o.id
from public.organizations o
where w.organization_id is null and o.owner_user_id = w.owner_id and o.name = w.name;

alter table public.workspaces
  alter column organization_id set not null;

create index idx_workspaces_organization_id on public.workspaces(organization_id);

set search_path to 'public';

create table public.plans (
  id text primary key,
  name text not null,
  monthly_content_allowance integer not null,
  max_workspaces integer not null,
  max_members integer not null,
  price_monthly_cents bigint not null,
  price_yearly_cents bigint not null,
  capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (id, name, monthly_content_allowance, max_workspaces, max_members, price_monthly_cents, price_yearly_cents, capabilities, sort_order) values
('essencial', 'Essencial', 15, 1, 1, 9900, 99000, '{"can_use_pilot":true,"can_use_radar":true,"performance_level":"basico","dna_visual_free_rounds":2}'::jsonb, 1),
('profissional', 'Profissional', 40, 1, 3, 19900, 199000, '{"can_use_pilot":true,"can_use_radar":true,"performance_level":"completo","dna_visual_free_rounds":2}'::jsonb, 2),
('agencia', 'Agência', 150, 5, 10, 49700, 497000, '{"can_use_pilot":true,"can_use_radar":true,"performance_level":"completo","dna_visual_free_rounds":2}'::jsonb, 3);

create type public.subscription_status as enum ('trialing','active','past_due','cancel_at_period_end','cancelled','expired');
create type public.billing_interval as enum ('monthly','yearly');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  billing_interval public.billing_interval not null default 'monthly',
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  activated_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  past_due_since timestamptz,
  past_due_grace_days integer not null default 3,
  pending_plan_id text references public.plans(id),
  pending_billing_interval public.billing_interval,
  asaas_customer_id text,
  asaas_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_status on public.subscriptions(status);

-- Backfill: toda organization existente recebe uma subscription trialing
-- (3 dias, mesma regra do trial atual em profiles) no plano Essencial por
-- padrão. Isso NÃO concede plano pago fictício — apenas replica o estado de
-- trial que profiles.trial_* já registrava, agora também no nível de
-- organization/subscription, sem ativar nenhum benefício adicional.
insert into public.subscriptions (organization_id, plan_id, billing_interval, status, trial_ends_at)
select o.id, 'essencial', 'monthly', 'trialing', coalesce(pr.trial_ends_at, now() + interval '3 days')
from public.organizations o
join public.workspaces w on w.organization_id = o.id
join public.profiles pr on pr.id = o.owner_user_id
where not exists (select 1 from public.subscriptions s where s.organization_id = o.id)
group by o.id, pr.trial_ends_at;

create table public.content_franchise_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  unique (content_id)
);

create index idx_content_franchise_ledger_org_period on public.content_franchise_ledger(organization_id, period_start);

create table public.subscription_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_status public.subscription_status,
  to_status public.subscription_status not null,
  reason text,
  created_at timestamptz not null default now()
);
