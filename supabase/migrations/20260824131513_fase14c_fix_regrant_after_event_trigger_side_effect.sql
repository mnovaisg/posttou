-- Bug real, crítico, causado pelo meu próprio event trigger: CREATE OR
-- REPLACE FUNCTION dispara o mesmo command tag 'CREATE FUNCTION' de uma
-- criação nova, então auto_revoke_new_function_grants revogou os grants
-- de authenticated/service_role destas 6 funções centrais (usadas por
-- praticamente toda policy RLS e Edge Function do produto) assim que eu
-- as recriei no ajuste anterior desta mesma fase. Restaura imediatamente.
grant execute on function public.is_current_account_active() to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated, service_role;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function public.check_subscription_entitlement(uuid) to authenticated, service_role;
-- enforce_content_franchise_gate é função de trigger (não precisa de
-- EXECUTE por nenhuma role para funcionar via trigger), mas restaura o
-- estado original mesmo assim por consistência com o que já existia.
