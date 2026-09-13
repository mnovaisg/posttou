
-- Bloco 12.1 — P0 do Bloco 12: public.temp_backup_sub estava pública com
-- RLS desabilitado e anon com CRUD completo. Auditoria completa antes de
-- remover: sem FKs de/para ela, sem triggers, sem views ou funções
-- referenciando-a, sem menção em nenhuma migration rastreada, sem
-- referência em nenhuma Edge Function ou código frontend/backend (só
-- aparecia no types.ts gerado, que é reflexo do schema, não uso real).
-- É um leftover de scratch/backup manual (nome e colunas — id,
-- organization_id, status — sugerem um snapshot manual de subscriptions
-- antes de alguma alteração, nunca versionado como migration própria).
-- Não escondendo o problema com RLS: removendo a tabela órfã de fato.
drop table if exists public.temp_backup_sub;
