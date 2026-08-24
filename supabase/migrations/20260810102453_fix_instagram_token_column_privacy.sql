-- =========================================================
-- Corrige vazamento real encontrado em teste manual (curl direto no
-- REST API com token de usuário autenticado): a migration "grants"
-- concedia SELECT de tabela inteira a instagram_accounts, o que
-- sobrescreve qualquer REVOKE de coluna feito antes — no Postgres,
-- GRANT de tabela inteira sempre prevalece sobre REVOKE de coluna.
-- Resultado: access_token_encrypted era legível por qualquer membro
-- autenticado do workspace via /rest/v1/instagram_accounts?select=*.
--
-- Correção: revoga o acesso de tabela inteira e concede apenas as
-- colunas não sensíveis. (Os arquivos de origem já foram corrigidos
-- para nascer assim; esta migration documenta o reparo aplicado em
-- produção durante a validação da Fase 1.)
-- =========================================================
revoke select on public.instagram_accounts from authenticated, anon;
revoke insert, update on public.instagram_accounts from authenticated, anon;

grant select (
  id, workspace_id, ig_user_id, username, status,
  token_expires_at, connected_by, created_at, updated_at
) on public.instagram_accounts to authenticated;
grant insert (workspace_id, ig_user_id, username, status, connected_by) on public.instagram_accounts to authenticated;
grant update (username, status, connected_by) on public.instagram_accounts to authenticated;
