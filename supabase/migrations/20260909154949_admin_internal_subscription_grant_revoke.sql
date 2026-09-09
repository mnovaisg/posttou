-- Bloco: Assinatura Interna/Cortesia. Mecanismo administrativo mínimo e
-- rastreável pra marcar uma organização como interna (QA, demonstração,
-- App Review, operação interna) usando o entitlement normal do POSTTOU —
-- nunca um bypass de platform_admin em check_subscription_entitlement
-- (não tocada), nunca um customer/subscription real no Asaas
-- (asaas_customer_id/asaas_subscription_id sempre ficam null). O plan_id
-- real escolhido determina os limites/recursos normalmente (franchise
-- gate, get_franchise_period usa activated_at como âncora — funciona sem
-- nenhuma mudança). Toda concessão/remoção gera audit_logs.
create or replace function public.admin_grant_internal_subscription_system(
  p_organization_id uuid,
  p_plan_id text,
  p_reason text
)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_plan_exists boolean;
begin
  perform public._require_platform_admin();

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select exists(select 1 from public.plans where id = p_plan_id) into v_plan_exists;
  if not v_plan_exists then
    raise exception 'INVALID_PLAN_ID';
  end if;

  if not exists(select 1 from public.organizations where id = p_organization_id) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  insert into public.subscriptions (
    organization_id, plan_id, billing_interval, status, activated_at,
    trial_ends_at, current_period_start, current_period_end, cancel_at_period_end,
    past_due_since, pending_change_kind, pending_plan_id, pending_billing_interval,
    pending_change_price_cents, pending_change_new_recurring_cents,
    asaas_customer_id, asaas_subscription_id,
    asaas_sync_status, asaas_sync_target_price_cents, asaas_sync_last_error, asaas_sync_attempted_at,
    metadata
  )
  values (
    p_organization_id, p_plan_id, 'monthly', 'active', now(),
    null, null, null, false,
    null, null, null, null,
    null, null,
    null, null,
    'synced', null, null, null,
    jsonb_build_object('internal', true, 'reason', p_reason, 'granted_by', auth.uid(), 'granted_at', now())
  )
  on conflict (organization_id) do update set
    plan_id = excluded.plan_id,
    billing_interval = excluded.billing_interval,
    status = 'active',
    activated_at = now(),
    trial_ends_at = null,
    current_period_start = null,
    current_period_end = null,
    cancel_at_period_end = false,
    past_due_since = null,
    pending_change_kind = null,
    pending_plan_id = null,
    pending_billing_interval = null,
    pending_change_price_cents = null,
    pending_change_new_recurring_cents = null,
    asaas_customer_id = null,
    asaas_subscription_id = null,
    asaas_sync_status = 'synced',
    asaas_sync_target_price_cents = null,
    asaas_sync_last_error = null,
    asaas_sync_attempted_at = null,
    metadata = coalesce(public.subscriptions.metadata, '{}'::jsonb) || jsonb_build_object('internal', true, 'reason', p_reason, 'granted_by', auth.uid(), 'granted_at', now()),
    updated_at = now()
  returning * into v_sub;

  perform public.log_audit_event(
    null,
    'admin_internal_subscription_granted',
    'subscription',
    v_sub.id,
    jsonb_build_object('organization_id', p_organization_id, 'plan_id', p_plan_id, 'reason', p_reason)
  );

  return v_sub;
end;
$function$;

create or replace function public.admin_revoke_internal_subscription_system(p_organization_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
begin
  perform public._require_platform_admin();

  select * into v_sub from public.subscriptions where organization_id = p_organization_id;
  if v_sub is null then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;
  if not public._is_internal_subscription(v_sub) then
    raise exception 'NOT_INTERNAL_SUBSCRIPTION';
  end if;

  update public.subscriptions
  set status = 'expired',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('internal', false, 'revoked_by', auth.uid(), 'revoked_at', now()),
      updated_at = now()
  where organization_id = p_organization_id
  returning * into v_sub;

  perform public.log_audit_event(
    null,
    'admin_internal_subscription_revoked',
    'subscription',
    v_sub.id,
    jsonb_build_object('organization_id', p_organization_id)
  );

  return v_sub;
end;
$function$;

revoke all on function public.admin_grant_internal_subscription_system(uuid, text, text) from public;
grant execute on function public.admin_grant_internal_subscription_system(uuid, text, text) to authenticated;
revoke all on function public.admin_revoke_internal_subscription_system(uuid) from public;
grant execute on function public.admin_revoke_internal_subscription_system(uuid) to authenticated;
