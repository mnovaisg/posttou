-- Bug real encontrado via advisors: toda função nova herdou o grant
-- default de EXECUTE para PUBLIC do Postgres. Revoga tudo e concede de
-- volta só o necessário (mesmo padrão de security_hardening_revoke_anon
-- da Fase 1).
revoke execute on function public.enforce_content_franchise_gate() from public;
revoke execute on function public.run_subscription_status_transitions_system() from public;
revoke execute on function public.apply_scheduled_downgrades_system() from public;
revoke execute on function public.apply_confirmed_plan_change_system(uuid) from public;
revoke execute on function public.process_asaas_payment_confirmed_system(text, text, timestamptz, timestamptz) from public;
revoke execute on function public.process_asaas_payment_overdue_system(text, text) from public;
revoke execute on function public.get_effective_subscription_status(public.subscriptions) from public;
revoke execute on function public.get_franchise_period(public.subscriptions, timestamptz) from public;
revoke execute on function public.is_organization_member(uuid) from public;
revoke execute on function public.is_organization_owner(uuid) from public;
revoke execute on function public.get_workspace_entitlements(uuid) from public;
revoke execute on function public.check_subscription_entitlement(uuid) from public;
revoke execute on function public.create_workspace_in_organization(uuid, text) from public;
revoke execute on function public.request_plan_change(uuid, text, public.billing_interval) from public;
revoke execute on function public.schedule_subscription_cancellation(uuid) from public;
revoke execute on function public.undo_subscription_cancellation(uuid) from public;

grant execute on function public.get_effective_subscription_status(public.subscriptions) to authenticated, service_role;
grant execute on function public.get_franchise_period(public.subscriptions, timestamptz) to authenticated, service_role;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function public.apply_scheduled_downgrades_system() to service_role;
grant execute on function public.run_subscription_status_transitions_system() to service_role;
