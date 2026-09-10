-- Flag de créditos ilimitados por workspace. Bypassa o consumo (balance
-- nunca é decrementado nem bloqueado) mas continua registrando cada
-- consumo no credit_ledger para auditoria/uso — só a checagem de saldo e
-- o débito real são pulados.
alter table public.credit_accounts
  add column is_unlimited boolean not null default false;

create or replace function public.consume_credits(p_workspace_id uuid, p_amount bigint, p_operation text, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS credit_ledger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.credit_accounts;
  v_new_balance bigint;
  v_ledger public.credit_ledger;
begin
  if p_amount <= 0 then
    raise exception 'p_amount deve ser positivo (quantidade a consumir).';
  end if;

  if not public.has_workspace_role(
    p_workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'Sem permissão para consumir créditos neste workspace.';
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  if v_account.is_unlimited then
    v_new_balance := v_account.balance;
  else
    if v_account.balance < p_amount then
      raise exception 'Saldo de créditos insuficiente.';
    end if;

    v_new_balance := v_account.balance - p_amount;

    update public.credit_accounts
    set balance = v_new_balance
    where id = v_account.id;
  end if;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after,
    operation, reference_type, reference_id, created_by, metadata
  ) values (
    p_workspace_id, v_account.id, -p_amount, v_new_balance,
    p_operation, p_reference_type, p_reference_id, auth.uid(),
    case when v_account.is_unlimited then p_metadata || jsonb_build_object('unlimited_account', true) else p_metadata end
  )
  returning * into v_ledger;

  return v_ledger;
end;
$function$;

create or replace function public.consume_credits_system(p_workspace_id uuid, p_amount bigint, p_operation text, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS credit_ledger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.credit_accounts;
  v_new_balance bigint;
  v_ledger public.credit_ledger;
begin
  if p_amount <= 0 then
    raise exception 'p_amount deve ser positivo (quantidade a consumir).';
  end if;

  select * into v_account from public.credit_accounts where workspace_id = p_workspace_id for update;
  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  if v_account.is_unlimited then
    v_new_balance := v_account.balance;
  else
    if v_account.balance < p_amount then
      raise exception 'Saldo de créditos insuficiente.';
    end if;

    v_new_balance := v_account.balance - p_amount;

    update public.credit_accounts set balance = v_new_balance where id = v_account.id;
  end if;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after, operation, reference_type, reference_id, created_by, metadata
  ) values (
    p_workspace_id, v_account.id, -p_amount, v_new_balance, p_operation, p_reference_type, p_reference_id, null,
    p_metadata || jsonb_build_object('system', true) ||
      case when v_account.is_unlimited then jsonb_build_object('unlimited_account', true) else '{}'::jsonb end
  )
  returning * into v_ledger;

  return v_ledger;
end;
$function$;

create or replace function public.pilot_check_budget(p_workspace_id uuid, p_plan_id uuid, p_needed bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance bigint;
  v_is_unlimited boolean;
  v_max_window bigint;
  v_consumed_window bigint;
  v_window_remaining bigint;
  v_available bigint;
begin
  select balance, is_unlimited into v_balance, v_is_unlimited from public.credit_accounts where workspace_id = p_workspace_id;
  select max_credits_per_window into v_max_window from public.pilot_settings where workspace_id = p_workspace_id;

  select coalesce(sum(g.credit_cost), 0) into v_consumed_window
  from public.ai_generations g
  join public.contents c on c.id = g.content_id
  join public.pilot_plan_items pi on pi.id = c.pilot_plan_item_id
  where pi.pilot_plan_id = p_plan_id and g.status = 'success';

  if coalesce(v_is_unlimited, false) then
    return jsonb_build_object(
      'sufficient', true,
      'needed', p_needed,
      'balance', v_balance,
      'window_budget', v_max_window,
      'window_remaining', case when v_max_window is null then null else greatest(v_max_window - v_consumed_window, 0) end,
      'available', p_needed
    );
  end if;

  if v_max_window is null then
    v_window_remaining := null;
    v_available := coalesce(v_balance, 0);
  else
    v_window_remaining := greatest(v_max_window - v_consumed_window, 0);
    v_available := least(coalesce(v_balance, 0), v_window_remaining);
  end if;

  return jsonb_build_object(
    'sufficient', v_available >= p_needed,
    'needed', p_needed,
    'balance', coalesce(v_balance, 0),
    'window_budget', v_max_window,
    'window_remaining', v_window_remaining,
    'available', v_available
  );
end;
$function$;

create or replace function public.check_pilot_activation_readiness(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_settings public.pilot_settings;
  v_brand public.brand_profiles;
  v_balance bigint;
  v_is_unlimited boolean;
  v_min_cost bigint;
  v_slot_count int;
  v_missing text[] := '{}';
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = p_workspace_id;
  if v_settings.id is null then
    v_missing := array_append(v_missing, 'settings_not_created');
  end if;

  select * into v_brand from public.brand_profiles where workspace_id = p_workspace_id;
  if v_brand.id is null or v_brand.company_name is null or v_brand.description is null or v_brand.onboarding_completed_at is null then
    v_missing := array_append(v_missing, 'brand_dna_incomplete');
  end if;

  select count(*) into v_slot_count from public.pilot_schedule_slots where workspace_id = p_workspace_id;
  if coalesce(v_slot_count, 0) < 1 then
    v_missing := array_append(v_missing, 'schedule_not_set');
  end if;

  if v_settings.id is not null then
    if v_settings.allowed_formats is null or array_length(v_settings.allowed_formats, 1) is null then
      v_missing := array_append(v_missing, 'formats_not_set');
    end if;
    if v_settings.max_posts_per_window is null or v_settings.max_posts_per_window <= 0 then
      v_missing := array_append(v_missing, 'frequency_not_set');
    end if;
  end if;

  select balance, is_unlimited into v_balance, v_is_unlimited from public.credit_accounts where workspace_id = p_workspace_id;
  select min(credit_cost) into v_min_cost from public.ai_operation_costs where generation_type in ('post_unico', 'carrossel');
  if not coalesce(v_is_unlimited, false) then
    if v_balance is null or v_min_cost is null or v_balance < v_min_cost then
      v_missing := array_append(v_missing, 'insufficient_credits');
    end if;
  end if;

  return jsonb_build_object('ready', array_length(v_missing, 1) is null, 'missing', to_jsonb(v_missing));
end;
$function$;

-- RPC admin para conceder/revogar créditos ilimitados, mesmo padrão da
-- assinatura interna/cortesia: somente platform_admin, com audit_logs.
create or replace function public.admin_grant_unlimited_credits_system(p_workspace_id uuid, p_reason text default null)
 RETURNS credit_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.credit_accounts;
begin
  perform public._require_platform_admin();

  update public.credit_accounts
  set is_unlimited = true
  where workspace_id = p_workspace_id
  returning * into v_account;

  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  perform public.log_audit_event(p_workspace_id, 'admin_unlimited_credits_granted', 'credit_accounts', v_account.id, jsonb_build_object('reason', p_reason, 'granted_by', auth.uid()));

  return v_account;
end;
$function$;

create or replace function public.admin_revoke_unlimited_credits_system(p_workspace_id uuid, p_reason text default null)
 RETURNS credit_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.credit_accounts;
begin
  perform public._require_platform_admin();

  update public.credit_accounts
  set is_unlimited = false
  where workspace_id = p_workspace_id
  returning * into v_account;

  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  perform public.log_audit_event(p_workspace_id, 'admin_unlimited_credits_revoked', 'credit_accounts', v_account.id, jsonb_build_object('reason', p_reason, 'revoked_by', auth.uid()));

  return v_account;
end;
$function$;