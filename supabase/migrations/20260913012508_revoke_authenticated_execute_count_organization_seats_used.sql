-- Auditoria pré-lançamento: count_organization_seats_used é SECURITY
-- DEFINER com EXECUTE liberado para `authenticated`, mas não checa se o
-- chamador tem relação com p_organization_id — qualquer usuário logado
-- podia informar o UUID de qualquer organização e receber a contagem de
-- assentos usados (membros + convites pendentes). Os únicos fluxos
-- legítimos que dependem dela (create_organization_invite,
-- accept_organization_invite) já são SECURITY DEFINER de propriedade de
-- `postgres` — a chamada interna deles não usa o grant de `authenticated`,
-- então revogar aqui não quebra nenhum caminho existente.
revoke execute on function public.count_organization_seats_used(uuid) from authenticated;
