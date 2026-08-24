-- =========================================================
-- Grants explícitos (o esquema padrão do Supabase já concede isto
-- via default privileges, mas deixamos explícito por segurança e clareza).
-- RLS continua sendo a camada real de autorização por linha.
-- =========================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.contents,
  public.content_versions,
  public.content_pages,
  public.content_elements,
  public.instagram_publications
to authenticated;

-- instagram_accounts é tratada à parte (ver instagram_accounts.sql): o
-- GRANT de tabela inteira aqui sobrescreveria o REVOKE de coluna feito lá
-- (GRANT de tabela sempre prevalece sobre REVOKE de coluna no Postgres).

-- Somente leitura para o cliente: escrita passa pelas funções SECURITY DEFINER.
grant select on public.credit_accounts, public.credit_ledger, public.audit_logs to authenticated;

grant execute on function public.consume_credits(uuid, bigint, text, text, uuid, jsonb) to authenticated;
grant execute on function public.grant_credits(uuid, bigint, text, text, uuid, jsonb) to authenticated;
grant execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
