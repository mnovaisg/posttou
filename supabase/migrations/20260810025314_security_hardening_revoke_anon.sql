-- O Supabase concede EXECUTE a "anon" por padrão em toda função nova do schema
-- public (default privileges), independente de PUBLIC. Precisa ser revogado
-- explicitamente do papel "anon" para cada função sensível.
revoke execute on function public.consume_credits(uuid, bigint, text, text, uuid, jsonb) from anon;
revoke execute on function public.grant_credits(uuid, bigint, text, text, uuid, jsonb) from anon;
revoke execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) from anon;
revoke execute on function public.is_workspace_member(uuid) from anon;
revoke execute on function public.workspace_role(uuid) from anon;
revoke execute on function public.has_workspace_role(uuid, public.workspace_role[]) from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.prevent_last_owner_removal() from anon;
