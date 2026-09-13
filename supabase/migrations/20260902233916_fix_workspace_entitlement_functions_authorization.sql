
-- Bloco 12.1 — P0 do Bloco 12: get_workspace_entitlements, check_subscription_entitlement
-- e check_brand_dna_ready eram SECURITY DEFINER acessíveis a qualquer
-- `authenticated`, mas nunca checavam se o chamador tinha relação com
-- p_workspace_id — um usuário autenticado podia informar o UUID de
-- QUALQUER workspace e receber status de assinatura/plano/trial/franquia
-- (e, no caso do brand_dna_ready, um boolean) de uma organização alheia.
--
-- Reutiliza a mesma infraestrutura de autorização já usada em
-- is_workspace_member() e o mesmo padrão já estabelecido em
-- start_pilot_generation() para permitir chamadas legítimas de
-- service_role (várias Edge Functions em background — ai-generate,
-- ai-generate-image, pilot-content-generate, performance-insights-
-- generator, brand-visual-dna-generate/interpret, pilot-visual-asset-retry
-- — chamam estas RPCs usando o client service_role, sem JWT de usuário,
-- então nunca teriam auth.uid(); is_workspace_member() sozinha bloquearia
-- essas chamadas legítimas). O bypass é explícito e só vale para
-- service_role (nunca para anon/authenticated).
--
-- Resposta idêntica para "workspace não existe" e "workspace existe mas
-- não sou membro" — nenhuma das duas informações vaza (mesmo formato,
-- mesmo motivo), atendendo ao requisito de resposta segura para UUID
-- inexistente.

create or replace function public.get_workspace_entitlements(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_org_id uuid;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_effective_status public.subscription_status;
  v_period record;
  v_used integer;
begin
  if v_jwt_role <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_WORKSPACE_MEMBER');
  end if;

  select organization_id into v_org_id from public.workspaces where id = p_workspace_id;
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_WORKSPACE_MEMBER');
  end if;

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIPTION_FOUND');
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  v_effective_status := public.get_effective_subscription_status(v_sub);
  select * into v_period from public.get_franchise_period(v_sub);

  select count(*) into v_used from public.content_franchise_ledger
  where organization_id = v_org_id and period_start = v_period.period_start;

  return jsonb_build_object(
    'allowed', v_effective_status not in ('expired','cancelled'),
    'status', v_effective_status,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'billing_interval', v_sub.billing_interval,
    'monthly_content_allowance', v_plan.monthly_content_allowance,
    'content_used_this_period', case when v_effective_status = 'trialing' then null else v_used end,
    'content_remaining_this_period', case when v_effective_status = 'trialing' then null else greatest(v_plan.monthly_content_allowance - v_used, 0) end,
    'franchise_period_start', v_period.period_start,
    'franchise_period_end', v_period.period_end,
    'max_workspaces', v_plan.max_workspaces,
    'max_members', v_plan.max_members,
    'trial_ends_at', v_sub.trial_ends_at,
    'capabilities', v_plan.capabilities
  );
end;
$function$;

create or replace function public.check_subscription_entitlement(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_org_id uuid;
  v_sub public.subscriptions;
  v_effective_status public.subscription_status;
begin
  if v_jwt_role <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_WORKSPACE_MEMBER');
  end if;

  if not public.is_current_account_active() then
    return jsonb_build_object('allowed', false, 'reason', 'ACCOUNT_DELETED');
  end if;

  select organization_id into v_org_id from public.workspaces where id = p_workspace_id;
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_WORKSPACE_MEMBER');
  end if;

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIPTION_FOUND');
  end if;

  v_effective_status := public.get_effective_subscription_status(v_sub);

  if v_effective_status in ('expired', 'cancelled') then
    return jsonb_build_object('allowed', false, 'reason', 'SUBSCRIPTION_' || upper(v_effective_status::text), 'status', v_effective_status);
  end if;

  return jsonb_build_object('allowed', true, 'status', v_effective_status);
end;
$function$;

create or replace function public.check_brand_dna_ready(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if v_jwt_role <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_WORKSPACE_MEMBER');
  end if;

  if exists (
    select 1 from public.brand_profiles
    where workspace_id = p_workspace_id
      and company_name is not null
      and description is not null
      and onboarding_completed_at is not null
  ) then
    return jsonb_build_object('allowed', true);
  end if;

  return jsonb_build_object('allowed', false, 'reason', 'BRAND_DNA_REQUIRED');
end;
$function$;
