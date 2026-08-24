-- O GRANT SELECT genérico da migration "grants" reconcede select em TODAS
-- as colunas de instagram_accounts, sobrescrevendo o revoke específico da
-- coluna access_token_encrypted feito em "instagram_accounts". Reaplicando
-- o revoke por último para garantir que o token nunca seja exposto via API.
revoke select (access_token_encrypted) on public.instagram_accounts from authenticated, anon, public;
