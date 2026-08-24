
-- Recovery backend para imagens presas em 'processing' (bug real
-- encontrado no teste de custo Kie.ai: webhook não chegou, e não havia
-- nenhum mecanismo de recuperação que não dependesse do frontend abrir
-- ai-check-image). Mesmas colunas de claim/lock já usadas em
-- pilot_plan_items (claimed_at/attempt_count) — convenção do projeto.
alter table public.ai_generations
  add column recovery_claimed_at timestamptz,
  add column recovery_attempts integer not null default 0;
