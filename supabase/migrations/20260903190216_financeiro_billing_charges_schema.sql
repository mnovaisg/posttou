-- Bloco Financeiro — a peça que faltava: ledger real de cobranças
-- individuais (nunca existiu antes; asaas_webhook_events era só log
-- bruto de idempotência, nunca um ledger). Alimentado dali pra frente
-- pelo webhook (payment.value real do Asaas) e, uma vez, por um backfill
-- administrativo manual que importa o histórico direto da API do Asaas.
--
-- original_amount_cents/discount_amount_cents são NULLABLE de propósito:
-- quando não há evidência segura de qual era o preço original/desconto
-- (cobranças importadas do backfill sem cupom correspondente em
-- coupon_redemptions), ficam NULL — nunca "original=final, discount=0"
-- inventado só pra fechar conta. Cobranças novas via webhook sempre têm
-- essa evidência (ou não há cupom = desconto 0 é fato, não invenção; ou
-- há cupom = valores exatos de coupon_redemptions).
create table public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  asaas_payment_id text not null unique,
  asaas_subscription_id text,
  plan_id text references public.plans(id),
  billing_interval public.billing_interval,
  kind text not null check (kind in ('recurring', 'upgrade')),
  original_amount_cents bigint,
  discount_amount_cents bigint,
  final_amount_cents bigint not null,
  coupon_redemption_id uuid references public.coupon_redemptions(id),
  due_date date not null,
  paid_at timestamptz,
  status text not null check (status in ('pending', 'paid', 'overdue', 'cancelled', 'refunded')),
  raw_asaas_status text,
  source text not null check (source in ('webhook', 'backfill')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_charges_organization_id_idx on public.billing_charges (organization_id, due_date desc);
create index billing_charges_due_date_idx on public.billing_charges (due_date);
create index billing_charges_status_idx on public.billing_charges (status);
alter table public.billing_charges enable row level security;
comment on table public.billing_charges is 'Ledger real de cobranças individuais (Asaas) — não existia antes. final_amount_cents sempre vem de payment.value real. original/discount ficam NULL quando não há evidência segura (nunca inventados). Nunca confundir com asaas_webhook_events (log bruto de idempotência).';
