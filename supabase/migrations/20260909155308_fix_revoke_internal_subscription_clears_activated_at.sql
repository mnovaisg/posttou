-- Bug real encontrado no teste: admin_revoke_internal_subscription_system
-- deixava activated_at preenchido (setado durante o grant) depois de
-- revogar. Como admin_lead_metrics_system conta "paid_customers"/"cliente
-- convertido" via (sub).activated_at is not null, uma organização
-- revogada continuava contando como conversão real pra sempre — exatamente
-- a contaminação que a regra de negócio proíbe. Corrigido: revoke agora
-- também limpa activated_at, já que uma assinatura interna nunca
-- representou uma conversão comercial real.
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
      activated_at = null,
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
