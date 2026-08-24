-- Fase 4 — Criar com IA: schema do AI Gateway (Provider/Adapter).
-- Nenhuma feature deve gravar aqui diretamente fora das Edge Functions do
-- gateway — este schema é o registro de auditoria/custo de toda geração de IA.

create type ai_generation_type as enum (
  'post_unico',
  'carrossel',
  'reels_roteiro',
  'legenda',
  'ideias_conteudo'
);

create type ai_generation_status as enum (
  'pending',
  'processing',
  'success',
  'failed'
);

-- Preço em créditos POSTTOU por tipo de geração. Fonte única de verdade do
-- custo: o frontend apenas LÊ esta tabela para exibir o preço, nunca decide
-- o valor cobrado — a Edge Function relê esta tabela no servidor antes de
-- debitar (nunca confia em um custo vindo do payload do cliente).
create table ai_operation_costs (
  generation_type ai_generation_type primary key,
  credit_cost bigint not null check (credit_cost > 0),
  updated_at timestamptz not null default now()
);

alter table ai_operation_costs enable row level security;

create policy ai_operation_costs_select_authenticated
  on ai_operation_costs for select
  to authenticated
  using (true);

-- Nenhuma policy de insert/update/delete para authenticated/anon:
-- preço só muda por migration ou por operador com service_role.

insert into ai_operation_costs (generation_type, credit_cost) values
  ('post_unico', 5),
  ('carrossel', 12),
  ('reels_roteiro', 8),
  ('legenda', 2),
  ('ideias_conteudo', 3);

create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  content_id uuid references contents(id) on delete set null,

  generation_type ai_generation_type not null,
  objective text,
  format content_format,
  theme_input text not null,

  -- Snapshot do contexto usado na geração (DNA da marca + histórico de
  -- conteúdo recente), para auditoria e para nunca depender de o estado
  -- atual do brand_profiles coincidir com o que foi realmente enviado à IA.
  brand_context_snapshot jsonb not null default '{}'::jsonb,
  history_snapshot jsonb not null default '[]'::jsonb,

  provider text not null,
  model text not null,
  task_id text,

  status ai_generation_status not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  result_text text,

  credit_cost bigint not null check (credit_cost > 0),
  credit_ledger_id uuid references credit_ledger(id) on delete set null,

  error_code text,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_generations_workspace_id_idx on ai_generations (workspace_id, created_at desc);
create index ai_generations_task_id_idx on ai_generations (task_id) where task_id is not null;
create index ai_generations_content_id_idx on ai_generations (content_id) where content_id is not null;

alter table ai_generations enable row level security;

create policy ai_generations_select_members
  on ai_generations for select
  to authenticated
  using (is_workspace_member(workspace_id));

-- Sem policies de insert/update/delete para authenticated: toda escrita
-- passa pela Edge Function do AI Gateway usando a service_role key (mesmo
-- padrão de consume_credits/grant_credits/log_audit_event via SECURITY
-- DEFINER — aqui a Edge Function já roda com privilégio de service role,
-- então não precisamos de uma função SECURITY DEFINER adicional).

-- Idempotência de webhooks assíncronos (Kie.ai jobs): cada entrega de
-- webhook é registrada por (task_id, delivery signature). Uma segunda
-- entrega do mesmo evento é detectada e ignorada no processamento.
create table ai_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  task_id text not null,
  signature text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, task_id, signature)
);

alter table ai_webhook_events enable row level security;

-- Tabela de uso exclusivamente interno (Edge Function via service role).
-- Nenhuma policy authenticated/anon: RLS ativo bloqueia todo acesso do
-- frontend por padrão (deny-by-default sem policies permissivas).

comment on table ai_generations is 'Registro de auditoria de toda geração de IA (Fase 4 — AI Gateway). Escrita apenas via Edge Functions com service_role.';
comment on table ai_operation_costs is 'Custo em créditos por tipo de geração, decidido no servidor. Frontend só lê para exibir o preço.';
comment on table ai_webhook_events is 'Log de entregas de webhook de providers assíncronos (Kie.ai), usado para garantir idempotência.';
