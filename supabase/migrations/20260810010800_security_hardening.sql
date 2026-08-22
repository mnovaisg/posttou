-- =========================================================
-- Hardening apontado pelo Supabase Advisor (lints de segurança):
-- 1) search_path fixo nas funções (evita search_path hijacking) —
--    já corrigido diretamente nas migrations de origem.
-- 2) Nenhuma função SECURITY DEFINER pode ser chamada por "anon"
--    (usuário não autenticado). O Supabase concede EXECUTE a anon/
--    authenticated por padrão em toda função nova do schema public
--    (default privileges), então cada função sensível precisa
--    revogar isso explicitamente do papel "anon".
-- =========================================================
revoke execute on function public.consume_credits(uuid, bigint, text, text, uuid, jsonb) from public, anon;
revoke execute on function public.grant_credits(uuid, bigint, text, text, uuid, jsonb) from public, anon;
revoke execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) from public, anon;
revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.workspace_role(uuid) from public, anon;
revoke execute on function public.has_workspace_role(uuid, public.workspace_role[]) from public, anon;

-- handle_new_user e prevent_last_owner_removal são funções de trigger:
-- disparam automaticamente no INSERT/UPDATE/DELETE, sem precisar de
-- EXECUTE para ninguém além do dono. Ninguém deve poder chamá-las via RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_last_owner_removal() from public, anon, authenticated;

-- Reafirma (idempotente) o acesso de "authenticated" às funções que o
-- frontend realmente precisa chamar via RPC.
grant execute on function public.consume_credits(uuid, bigint, text, text, uuid, jsonb) to authenticated;
grant execute on function public.grant_credits(uuid, bigint, text, text, uuid, jsonb) to authenticated;
grant execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
