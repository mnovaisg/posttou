-- Bloco Clientes & Leads — schema novo. Nenhuma tabela aqui duplica
-- subscriptions/coupons/Asaas: status comercial continua sendo
-- calculado on-the-fly a partir de subscriptions + get_effective_subscription_status
-- + subscription_status_history (já existentes). O que é novo aqui é
-- só o que genuinamente não existia: contato opcional, consentimento
-- de marketing granular e auditável, atribuição de origem (primeiro
-- toque, nunca sobrescrita) e anotações administrativas.

-- 1) Contato opcional — nunca obrigatório no cadastro (aprovado item 3).
alter table public.profiles add column if not exists whatsapp text;

-- 2) Consentimento de marketing granular e append-only (aprovado item 4
-- e item 9 — nunca inferido do aceite de Termos). A leitura do estado
-- "atual" é sempre a última linha por (user_id, channel); nunca
-- sobrescrevemos uma linha existente, sempre inserimos uma nova.
create table public.marketing_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  opted_in boolean not null,
  source text not null,
  changed_at timestamptz not null default now()
);
create index marketing_consents_user_channel_idx on public.marketing_consents (user_id, channel, changed_at desc);
alter table public.marketing_consents enable row level security;
comment on table public.marketing_consents is 'Consentimento de marketing por canal (email/whatsapp), append-only — a linha mais recente por (user_id, channel) é o estado atual. Nunca confundir com legal_acceptances (Termos/Privacidade, jurídico, não é opt-in de comunicação).';

-- 3) Atribuição de origem — 1 linha por organização, capturada uma
-- única vez no primeiro login pós-cadastro (mesmo mecanismo seguro já
-- usado para Instagram/cupom pendente: sessionStorage → raw_user_meta_data
-- no signUp → RPC no primeiro login autenticado). UNIQUE + a RPC usa
-- ON CONFLICT DO NOTHING, então uma visita futura nunca sobrescreve a
-- primeira atribuição (aprovado item 5).
create table public.lead_attribution (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  coupon_code_at_signup text,
  captured_at timestamptz not null default now()
);
alter table public.lead_attribution enable row level security;
comment on table public.lead_attribution is 'Atribuição de primeiro toque por organização — capturada uma única vez (ON CONFLICT DO NOTHING na RPC de escrita), nunca sobrescrita por visitas/cadastros futuros da mesma organização.';

-- 4) Notas administrativas — append-only (histórico nunca editado).
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index lead_notes_organization_id_idx on public.lead_notes (organization_id, created_at desc);
alter table public.lead_notes enable row level security;
comment on table public.lead_notes is 'Observações administrativas internas por organização — nunca visível ao cliente. Append-only, sem edição/remoção.';

-- 5) Tags — estado atual (mutável por natureza, ao contrário de notas),
-- 1 linha por organização.
create table public.lead_tags (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  tags text[] not null default '{}',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.lead_tags enable row level security;
comment on table public.lead_tags is 'Tags administrativas atuais por organização (mutável) — classificação livre para o CRM interno, nunca visível ao cliente.';

-- 6) Follow-up estruturado — append-only (nova ação = nova linha),
-- cada uma pode ser marcada concluída. Sem automação (aprovado item 8).
create table public.lead_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null check (action_type in ('contact', 'proposal', 'recover_trial', 'billing', 'other')),
  due_at date,
  note text,
  assigned_to uuid references auth.users(id),
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index lead_follow_ups_organization_id_idx on public.lead_follow_ups (organization_id, status, due_at);
alter table public.lead_follow_ups enable row level security;
comment on table public.lead_follow_ups is 'Próxima ação comercial por organização — controle administrativo manual, sem automação. status=open/done; nova ação é sempre uma nova linha (histórico preservado).';

-- Índice que faltava para o join Admin (organizations → dono):
create index if not exists organizations_owner_user_id_idx on public.organizations (owner_user_id);
