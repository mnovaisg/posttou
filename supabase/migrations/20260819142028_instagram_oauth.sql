-- Fase 6 (OAuth) — Instagram Business Login.
--
-- instagram_oauth_states: vincula cada autorização iniciada ao
-- user_id/workspace_id que a pediu, com uso único (used_at) e expiração
-- curta. É o mecanismo de proteção contra CSRF exigido pelo fluxo — o
-- callback nunca confia em workspace_id vindo do cliente, só no que está
-- gravado aqui, sob controle do servidor. Nunca lida/gravada pelo
-- cliente — só pelas Edge Functions instagram-oauth-start/callback via
-- service role.
create table public.instagram_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

comment on table public.instagram_oauth_states is 'State CSRF-safe do fluxo OAuth do Instagram: single-use (used_at) + expiração curta (expires_at). Único jeito de o callback saber a qual workspace/usuário a autorização pertence.';

alter table public.instagram_oauth_states enable row level security;

create index instagram_oauth_states_expires_idx on public.instagram_oauth_states(expires_at);

-- Dados adicionais de perfil exibidos no frontend + suporte a
-- reconexão/desconexão sem duplicar linhas.
alter table public.instagram_accounts
  add column name text,
  add column profile_picture_url text,
  add column last_connected_at timestamptz,
  add column disconnected_at timestamptz;

comment on column public.instagram_accounts.access_token_encrypted is 'Token de longa duração (60 dias) cifrado com AES-256-GCM (INSTAGRAM_TOKEN_ENCRYPTION_KEY) pela Edge Function instagram-oauth-callback. Nunca texto puro, nunca exposto ao frontend.';

-- Uma linha por conta Instagram dentro de um workspace — reconectar
-- atualiza a linha existente em vez de duplicar.
create unique index instagram_accounts_workspace_ig_user_key on public.instagram_accounts(workspace_id, ig_user_id);

-- Uma mesma conta Instagram não pode estar "conectada" em dois workspaces
-- ao mesmo tempo — reforçado no banco, não só na aplicação.
create unique index instagram_accounts_active_ig_user_key on public.instagram_accounts(ig_user_id) where status = 'conectado';
