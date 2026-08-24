-- Crítico: qualquer usuário autenticado podia chamar diretamente
-- process_asaas_payment_confirmed_system e se auto-conceder assinatura
-- ativa sem pagar (default privilege do schema concedeu a authenticated
-- na criação). Restringe a service_role apenas.
revoke execute on function public.apply_confirmed_plan_change_system(uuid) from authenticated;
revoke execute on function public.apply_scheduled_downgrades_system() from authenticated;
revoke execute on function public.process_asaas_payment_confirmed_system(text, text, timestamptz, timestamptz) from authenticated;
revoke execute on function public.process_asaas_payment_overdue_system(text, text) from authenticated;
