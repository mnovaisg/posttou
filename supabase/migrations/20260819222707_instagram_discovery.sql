-- Fase 6 — Onboarding Inteligente + Instagram Discovery.
--
-- Trial é elegibilidade POR USUÁRIO (auth.users.id), não por workspace —
-- fica em profiles, não em workspaces, para que criar um segundo
-- workspace nunca gere um segundo trial.
alter table public.profiles
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column trial_status text not null default 'active'
    check (trial_status in ('active', 'expired', 'converted'));

comment on column public.profiles.trial_status is '1 trial por usuário (auth.users.id), independente de quantos workspaces ele tiver.';

-- handle_new_user() passa a iniciar o trial (3 dias) junto com o
-- cadastro, no mesmo INSERT em profiles — sem duplicar a concessão de
-- créditos de boas-vindas já existente, que continua igual.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text;
  v_workspace_name text;
  v_slug_base text;
  v_slug text;
  v_workspace_id uuid;
  v_account_id uuid;
  v_welcome_credits bigint := 50;
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_workspace_name := coalesce(new.raw_user_meta_data ->> 'workspace_name', v_full_name || ' — Workspace');

  insert into public.profiles (id, full_name, trial_started_at, trial_ends_at, trial_status)
  values (new.id, v_full_name, now(), now() + interval '3 days', 'active')
  on conflict (id) do nothing;

  v_slug_base := public.slugify_base(v_workspace_name);
  v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.workspaces (name, slug, owner_id)
  values (v_workspace_name, v_slug, new.id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  insert into public.credit_accounts (workspace_id, balance)
  values (v_workspace_id, v_welcome_credits)
  returning id into v_account_id;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after, operation, reference_type, created_by
  ) values (
    v_workspace_id, v_account_id, v_welcome_credits, v_welcome_credits, 'credito_boas_vindas', 'onboarding', new.id
  );

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (v_workspace_id, new.id, 'signup', 'workspace', v_workspace_id, jsonb_build_object('email', new.email));

  return new;
end;
$function$;

-- ── Cache do dado bruto da Meta (Business Discovery), separado da
-- análise da IA — consultar o mesmo @handle de novo dentro de 6h reusa
-- isto em vez de gastar uma nova chamada à API/IA.
create table public.instagram_handle_snapshots (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  ig_user_id text,
  profile_snapshot jsonb not null default '{}'::jsonb,
  media_snapshot jsonb not null default '[]'::jsonb,
  fields_availability jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.instagram_handle_snapshots is 'Cache de 6h do dado bruto retornado pelo Business Discovery para um @handle. Só dados A (reais da API) — fields_availability registra o que realmente veio, nunca assume.';

alter table public.instagram_handle_snapshots enable row level security;

create index instagram_handle_snapshots_handle_idx on public.instagram_handle_snapshots(handle, expires_at desc);

-- ── Sessão anônima do visitante (pré-cadastro). Autenticada só pelo
-- token opaco de alta entropia — o token em si NUNCA é gravado, só seu
-- hash. Zero RLS policies: nada disso é acessível via REST direto, só
-- pelas Edge Functions com o token em mãos.
create table public.pre_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  handle text not null,
  snapshot_id uuid references public.instagram_handle_snapshots(id) on delete set null,
  used_cached_snapshot boolean not null default false,
  status text not null default 'collecting'
    check (status in ('collecting', 'analyzing', 'ready', 'failed', 'claimed', 'expired')),
  dna_preliminar jsonb,
  ideias_preliminares jsonb,
  ai_provider text,
  ai_model text,
  error_code text,
  error_message text,
  ip_hash text not null,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_workspace_id uuid references public.workspaces(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

comment on table public.pre_onboarding_sessions is 'Experiência de Discovery anônima, pré-cadastro. token_hash = sha256(token opaco); ip_hash = HMAC-SHA256(ip, DISCOVERY_IP_HASH_SECRET). Claim é atômico e single-use (WHERE status=''ready'' AND claimed_at IS NULL).';

alter table public.pre_onboarding_sessions enable row level security;

create index pre_onboarding_sessions_ip_hash_idx on public.pre_onboarding_sessions(ip_hash, created_at);
create index pre_onboarding_sessions_handle_idx on public.pre_onboarding_sessions(handle, created_at);

-- ── Limpeza real dos dados temporários. Sessões expiradas e nunca
-- reivindicadas: zera DNA/ideias/vínculo de snapshot imediatamente
-- (dado pessoal-ish de um visitante anônimo não fica parado), mantém só
-- a linha com status/contagem por mais alguns dias para a telemetria
-- agregada, depois apaga de vez. Snapshots expirados são removidos
-- direto (são só cache).
create or replace function public.cleanup_expired_discovery_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pre_onboarding_sessions
    set status = 'expired', dna_preliminar = null, ideias_preliminares = null, snapshot_id = null
    where status in ('collecting', 'analyzing', 'ready') and expires_at < now();

  delete from public.pre_onboarding_sessions
    where status = 'expired' and expires_at < now() - interval '7 days';

  delete from public.instagram_handle_snapshots
    where expires_at < now();
end;
$$;

revoke all on function public.cleanup_expired_discovery_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_discovery_data() to service_role, postgres;

-- ── Telemetria server-side da Discovery anônima (sem tabela nova —
-- reaproveita pre_onboarding_sessions). Não exposta via API pública:
-- sem GRANT para anon/authenticated, só legível por quem tem acesso
-- direto ao banco (postgres/service_role).
create or replace view public.discovery_usage_daily as
select
  date_trunc('day', created_at) as day,
  count(*) as total_sessions,
  count(*) filter (where used_cached_snapshot) as cache_hits,
  count(*) filter (where not used_cached_snapshot) as meta_calls,
  count(*) filter (where status = 'ready') as ai_success,
  count(*) filter (where status = 'failed') as ai_failed,
  count(*) filter (where claimed_at is not null) as claimed_conversions
from public.pre_onboarding_sessions
group by 1
order by 1 desc;

revoke all on public.discovery_usage_daily from public, anon, authenticated;
