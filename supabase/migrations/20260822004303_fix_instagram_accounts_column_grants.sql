-- Bug pré-existente da Fase 6: a migration que adicionou name,
-- profile_picture_url, last_connected_at, disconnected_at a
-- instagram_accounts nunca concedeu SELECT nessas colunas para
-- authenticated (só as colunas originais tinham grant). Isso ficou
-- latente porque nenhuma conta real esteve conectada até agora — um
-- select(*) numa linha existente falha inteiro com "permission denied"
-- quando qualquer coluna selecionada não tem grant. access_token_encrypted
-- continua propositalmente sem SELECT — é a única coluna sensível aqui.
grant select (name, profile_picture_url, last_connected_at, disconnected_at) on public.instagram_accounts to authenticated;
