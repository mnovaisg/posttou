
-- Regra permanente desde a Fase 14B: toda função nova nasce com EXECUTE
-- concedido a anon/authenticated por privilégio default do schema.
-- get_invite_preview é a única exceção intencional (permite pré-visualizar
-- um convite antes de logar) — todas as outras são revogadas de anon.
revoke execute on function public.count_organization_seats_used(uuid) from anon;
revoke execute on function public.list_organization_members(uuid) from anon;
revoke execute on function public.list_organization_invites(uuid) from anon;
revoke execute on function public.create_organization_invite(uuid, text, public.workspace_role) from anon;
revoke execute on function public.resend_organization_invite(uuid) from anon;
revoke execute on function public.cancel_organization_invite(uuid) from anon;
revoke execute on function public.accept_organization_invite(text) from anon;
revoke execute on function public.change_member_role(uuid, uuid, public.workspace_role) from anon;
revoke execute on function public.remove_organization_member(uuid, uuid) from anon;
