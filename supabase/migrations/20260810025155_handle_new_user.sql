-- =========================================================
-- Onboarding automático: ao criar um usuário no Supabase Auth,
-- criamos profile + workspace inicial + membership (owner) +
-- conta de créditos com saldo de boas-vindas + log de auditoria.
-- Tudo em uma única transação (o trigger falha => o signup falha).
-- =========================================================
create or replace function public.slugify_base(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, 'workspace')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name)
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
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Cria profile + workspace inicial + membership owner + créditos de boas-vindas para todo novo usuário.';
