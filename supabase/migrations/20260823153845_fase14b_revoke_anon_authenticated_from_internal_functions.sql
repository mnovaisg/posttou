-- ALTER DEFAULT PRIVILEGES do schema concede EXECUTE a anon/authenticated
-- automaticamente em toda função nova (não só PUBLIC) — revoke from public
-- não bastou para estas duas, que são de uso exclusivamente interno
-- (trigger function e cron/service_role).
revoke execute on function public.enforce_content_franchise_gate() from anon, authenticated;
revoke execute on function public.run_subscription_status_transitions_system() from anon, authenticated;
