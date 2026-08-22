-- Fase 7 — Publicação real. 'publicando' é o estado intermediário entre
-- 'agendado' e 'publicado'/'falhou', reservado ao worker de publicação
-- (nunca setado manualmente por usuário). Isolado em sua própria
-- migration porque ALTER TYPE ... ADD VALUE não pode ser usado na mesma
-- transação em que o novo valor é referenciado.
alter type public.content_status add value if not exists 'publicando' after 'agendado';
