-- Bug crítico real encontrado em teste E2E de signup: handle_new_user()
-- nunca foi atualizado quando workspaces.organization_id virou NOT NULL
-- (Fase 14B) — todo cadastro novo estava quebrando com violação de
-- constraint. Corrige criando a organization + subscription trialing (3
-- dias, mesma regra) junto com o workspace, no mesmo trigger.
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
  v_organization_id uuid;
  v_account_id uuid;
  v_welcome_credits bigint := 50;
  v_trial_ends_at timestamptz := now() + interval '3 days';
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_workspace_name := coalesce(new.raw_user_meta_data ->> 'workspace_name', v_full_name || ' — Workspace');

  insert into public.profiles (id, full_name, trial_started_at, trial_ends_at, trial_status)
  values (new.id, v_full_name, now(), v_trial_ends_at, 'active')
  on conflict (id) do nothing;

  insert into public.organizations (name, owner_user_id)
  values (v_workspace_name, new.id)
  returning id into v_organization_id;

  v_slug_base := public.slugify_base(v_workspace_name);
  v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.workspaces (name, slug, owner_id, organization_id)
  values (v_workspace_name, v_slug, new.id, v_organization_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  insert into public.subscriptions (organization_id, plan_id, billing_interval, status, trial_ends_at)
  values (v_organization_id, 'essencial', 'monthly', 'trialing', v_trial_ends_at);

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
$function$
