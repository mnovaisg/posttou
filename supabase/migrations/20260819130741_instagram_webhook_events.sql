-- Fase 6 (infraestrutura de webhook) — recepção de eventos do Instagram
-- (Meta) via Instagram API with Instagram Login, antes da configuração
-- completa do Meta App/OAuth. Guarda cada entrega para auditoria/debug e
-- associa ao workspace correto quando a conta Instagram já estiver
-- conectada (instagram_accounts.ig_user_id). Escrita só via service role
-- (Edge Function instagram-webhook) — nunca pelo cliente, mesmo padrão de
-- ai_webhook_events da Fase 4/5.
create table public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  instagram_account_id uuid references public.instagram_accounts(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  dedupe_key text not null unique,
  signature_verified boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.instagram_webhook_events is 'Log bruto de cada entrega de webhook do Instagram (Meta), deduplicado por dedupe_key (hash do corpo + índice do entry). Nunca contém tokens de acesso.';
comment on column public.instagram_webhook_events.dedupe_key is 'sha256(corpo bruto da requisição) + índice do entry — Meta reenvia o corpo idêntico em retries, então isso garante idempotência.';
comment on column public.instagram_webhook_events.signature_verified is 'true somente se X-Hub-Signature-256 foi validada com INSTAGRAM_APP_SECRET. false quando o secret ainda não está configurado (fase pré-Meta App) — nunca confundir com evento verificado.';

alter table public.instagram_webhook_events enable row level security;

create index instagram_webhook_events_workspace_idx on public.instagram_webhook_events(workspace_id);
create index instagram_webhook_events_ig_user_idx on public.instagram_webhook_events(ig_user_id);

-- Somente membros do workspace correspondente podem ler seus próprios
-- eventos. Nenhuma policy de insert/update/delete para authenticated/anon
-- — só o service role (usado pela Edge Function) escreve nesta tabela.
create policy instagram_webhook_events_select_members
  on public.instagram_webhook_events for select
  to authenticated
  using (workspace_id is not null and is_workspace_member(workspace_id));
