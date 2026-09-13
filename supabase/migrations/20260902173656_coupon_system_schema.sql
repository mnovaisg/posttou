
-- Bloco 11 complemento: infraestrutura de cupons promocionais.
-- Validação SEMPRE server-side — o frontend nunca envia discount_value,
-- só o código. Segue os mesmos padrões já estabelecidos no billing
-- (SECURITY DEFINER RPCs, RLS default-deny em tabela financeira, dedup
-- insert-first-catch-unique-violation igual a asaas_webhook_events).

create type public.coupon_discount_type as enum ('percentage', 'fixed');
create type public.coupon_duration as enum ('first_payment', 'recurring');
create type public.coupon_redemption_status as enum ('reserved', 'applied', 'failed', 'released');

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text generated always as (lower(code)) stored,
  discount_type public.coupon_discount_type not null,
  discount_value numeric not null check (discount_value > 0),
  duration public.coupon_duration not null default 'first_payment',
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_organization int not null default 1 check (max_redemptions_per_organization > 0),
  eligible_plan_ids text[],
  eligible_billing_intervals public.billing_interval[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percentage_range check (discount_type <> 'percentage' or (discount_value > 0 and discount_value <= 100)),
  constraint coupons_dates_order check (starts_at is null or expires_at is null or starts_at < expires_at)
);
create unique index coupons_code_normalized_key on public.coupons (code_normalized);

comment on table public.coupons is 'Cupons promocionais. discount_value nunca é lido do frontend em nenhum fluxo de aplicação — só validado/calculado aqui no servidor.';
comment on column public.coupons.max_redemptions_per_organization is 'V1 só suporta efetivamente 1 (enforced por unique(coupon_id, organization_id) em coupon_redemptions) — coluna preparada para permitir >1 no futuro sem quebrar o schema.';

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  organization_id uuid not null references public.organizations(id),
  subscription_id uuid references public.subscriptions(id),
  plan_id text not null references public.plans(id),
  billing_interval public.billing_interval not null,
  asaas_subscription_id text,
  asaas_payment_id text,
  original_amount_cents bigint not null check (original_amount_cents >= 0),
  discount_amount_cents bigint not null check (discount_amount_cents >= 0),
  final_amount_cents bigint not null check (final_amount_cents >= 0),
  status public.coupon_redemption_status not null default 'reserved',
  failure_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_redemptions_final_le_original check (final_amount_cents <= original_amount_cents),
  constraint coupon_redemptions_amounts_consistent check (discount_amount_cents = original_amount_cents - final_amount_cents)
);
create unique index coupon_redemptions_one_per_org on public.coupon_redemptions (coupon_id, organization_id);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id) where status = 'applied';

comment on table public.coupon_redemptions is 'Uma linha por (coupon_id, organization_id) — unique index garante idempotência real: reaplicar o mesmo código pela mesma organização nunca duplica desconto, sempre retorna a linha já existente.';

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
