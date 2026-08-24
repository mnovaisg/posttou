
-- Fase 14C — LGPD. Mapeamento feito ANTES de implementar (ver relatório):
-- workspaces.owner_id -> profiles ON DELETE RESTRICT (impede apagar um
-- profile que ainda é dono de workspace) e o trigger
-- forbid_content_hard_delete bloqueia qualquer DELETE físico em `contents`
-- — logo um DELETE CASCADE de workspace com conteúdo é estruturalmente
-- impossível hoje (proteção já existente, não nova). audit_logs.user_id e
-- credit_ledger.created_by já são ON DELETE SET NULL — trilha de auditoria
-- e financeira sobrevivem nativamente à remoção de um profile.
-- Decisão desta fase: "exclusão de conta" = ANONIMIZAÇÃO + bloqueio de
-- login (profiles.deleted_at), nunca DELETE físico de workspace/conteúdo.
-- Purga física definitiva fica fora deste escopo (pendência documentada).
alter table public.profiles add column deleted_at timestamptz;

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('privacy_policy','terms_of_service')),
  version text not null,
  content_url text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.legal_documents enable row level security;
create policy legal_documents_select_all on public.legal_documents for select to authenticated, anon using (true);

insert into public.legal_documents (document_type, version, is_current) values
('privacy_policy', '2026.08-provisorio', true),
('terms_of_service', '2026.08-provisorio', true);

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  accepted_at timestamptz not null default now()
);
alter table public.legal_acceptances enable row level security;
create policy legal_acceptances_select_own on public.legal_acceptances for select to authenticated using (user_id = auth.uid());

create or replace function public.record_legal_acceptance(p_document_type text, p_document_version text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.legal_acceptances (user_id, document_type, document_version)
  values (auth.uid(), p_document_type, p_document_version);
end;
$$;

grant execute on function public.record_legal_acceptance(text, text) to authenticated;
revoke execute on function public.record_legal_acceptance(text, text) from anon;

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processed_auto','pending_manual_review','cancelled')),
  reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  notes text
);
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_select_own on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid());

-- Exporta os dados pessoais do próprio usuário (LGPD: portabilidade).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'auth_email', (select email from auth.users where id = v_uid),
    'organizations_owned', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.organizations o where o.owner_user_id = v_uid),
    'workspace_memberships', (
      select coalesce(jsonb_agg(jsonb_build_object('workspace_id', wm.workspace_id, 'workspace_name', w.name, 'role', wm.role, 'since', wm.created_at)), '[]'::jsonb)
      from public.workspace_members wm join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = v_uid
    ),
    'contents_created', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'type', c.type, 'status', c.status, 'created_at', c.created_at)), '[]'::jsonb)
      from public.contents c where c.created_by = v_uid
    ),
    'audit_log_entries', (
      select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'resource_type', a.resource_type, 'created_at', a.created_at)), '[]'::jsonb)
      from public.audit_logs a where a.user_id = v_uid order by a.created_at desc limit 500
    ),
    'legal_acceptances', (
      select coalesce(jsonb_agg(to_jsonb(la)), '[]'::jsonb) from public.legal_acceptances la where la.user_id = v_uid
    )
  );
end;
$$;

grant execute on function public.export_my_data() to authenticated;
revoke execute on function public.export_my_data() from anon;

-- Solicita exclusão. Confirmação forte: o chamador precisa repetir o
-- próprio e-mail exatamente. Casos seguros (não é dono de nenhum
-- workspace compartilhado com outros membros) são processados na hora,
-- como anonimização + bloqueio de login — nunca DELETE físico de
-- workspace/conteúdo (ver mapeamento no topo do arquivo). Casos com
-- workspace compartilhado como owner ficam 'pending_manual_review':
-- owner de uma Agência não pode arrastar dados de outros usuários numa
-- exclusão automática sem uma regra explícita de transferência de posse,
-- que não existe ainda — documentado como pendência.
create or replace function public.request_account_deletion(p_email_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_real_email text;
  v_request_id uuid;
  v_has_shared_ownership boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select email into v_real_email from auth.users where id = v_uid;
  if lower(trim(p_email_confirmation)) <> lower(v_real_email) then
    raise exception 'EMAIL_CONFIRMATION_MISMATCH';
  end if;

  -- "compartilhado" = workspace onde este usuário é owner E existe pelo
  -- menos outro membro além dele.
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id in (select workspace_id from public.workspace_members where user_id = v_uid and role = 'owner')
      and wm.user_id <> v_uid
  ) into v_has_shared_ownership;

  insert into public.account_deletion_requests (user_id, status)
  values (v_uid, case when v_has_shared_ownership then 'pending_manual_review' else 'pending' end)
  returning id into v_request_id;

  if v_has_shared_ownership then
    perform public.log_audit_event(
      (select workspace_id from public.workspace_members where user_id = v_uid and role = 'owner' limit 1),
      'account_deletion_requested_manual_review', 'account_deletion_requests', v_request_id, '{}'::jsonb
    );
    return jsonb_build_object('status', 'pending_manual_review', 'request_id', v_request_id,
      'message', 'Você é owner de um workspace com outros membros. Transfira a posse ou peça suporte para prosseguir com a exclusão.');
  end if;

  -- Caso seguro: anonimiza e bloqueia login. Não deleta workspace/conteúdo.
  update public.profiles set full_name = 'Usuário removido', avatar_url = null, deleted_at = now() where id = v_uid;
  update public.instagram_accounts set status = 'desconectado', access_token_encrypted = null, disconnected_at = now()
    where workspace_id in (select workspace_id from public.workspace_members where user_id = v_uid) and connected_by = v_uid;

  update public.account_deletion_requests set status = 'processed_auto', processed_at = now() where id = v_request_id;

  return jsonb_build_object('status', 'processed_auto', 'request_id', v_request_id,
    'message', 'Conta anonimizada e login bloqueado. Dados de workspace preservados conforme política de retenção.');
end;
$$;

grant execute on function public.request_account_deletion(text) to authenticated;
revoke execute on function public.request_account_deletion(text) from anon;
