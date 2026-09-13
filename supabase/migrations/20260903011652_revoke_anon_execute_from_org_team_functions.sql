
-- Bloco 12.2 — item 3: SECURITY DEFINER acessíveis a `anon` sem motivo de
-- negócio. Todas as 15 funções abaixo já são internamente seguras mesmo
-- se chamadas por anon hoje (checam auth.uid()/has_workspace_role/
-- is_workspace_member/is_organization_member e rejeitam), mas não há
-- razão para anon precisar delas — revogando por defesa em profundidade.
-- `authenticated`/`service_role`/`postgres` já têm grant próprio e
-- independente (confirmado antes desta migration), então revogar de
-- PUBLIC não afeta o uso real do app.
--
-- get_invite_preview NÃO está nesta lista — é intencionalmente pública
-- (tela de preview de convite antes do login, protegida pelo token
-- secreto, não pelo papel do chamador).
revoke execute on function public.accept_organization_invite(text) from public;
revoke execute on function public.cancel_organization_invite(uuid) from public;
revoke execute on function public.change_member_role(uuid, uuid, public.workspace_role) from public;
revoke execute on function public.count_organization_seats_used(uuid) from public;
revoke execute on function public.create_organization_invite(uuid, text, public.workspace_role) from public;
revoke execute on function public.dismiss_onboarding(uuid) from public;
revoke execute on function public.dismiss_onboarding_step(uuid, text) from public;
revoke execute on function public.export_my_data() from public;
revoke execute on function public.get_onboarding_state(uuid) from public;
revoke execute on function public.list_organization_invites(uuid) from public;
revoke execute on function public.list_organization_members(uuid) from public;
revoke execute on function public.record_legal_acceptance(text, text) from public;
revoke execute on function public.remove_organization_member(uuid, uuid) from public;
revoke execute on function public.request_account_deletion(text) from public;
revoke execute on function public.resend_organization_invite(uuid) from public;
