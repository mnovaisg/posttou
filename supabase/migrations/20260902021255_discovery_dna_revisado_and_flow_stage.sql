-- Bloco 4 do redesenho de onboarding: persiste a revisão do DNA feita
-- pelo visitante ANTES do cadastro, e o ponto da experiência em que ele
-- está, para sobreviver a refresh/troca de aba. Reaproveita
-- pre_onboarding_sessions (já existente, já com TTL e RLS sem policies —
-- só service_role escreve) em vez de criar tabela nova.
--
-- dna_revisado fica em coluna separada de dna_preliminar (nunca
-- sobrescrita) — dna_preliminar continua sendo o registro imutável do
-- que a IA sugeriu originalmente, útil para auditoria/reprocessamento;
-- dna_revisado é o que o usuário efetivamente editou/aprovou.
alter table public.pre_onboarding_sessions
  add column dna_revisado jsonb,
  add column flow_stage text;

comment on column public.pre_onboarding_sessions.dna_revisado is
  'DNA após edição do visitante na tela de revisão pré-cadastro. Nunca sobrescreve dna_preliminar (mantido intacto para auditoria/reprocessamento) — null enquanto o visitante não editar nada.';

comment on column public.pre_onboarding_sessions.flow_stage is
  'Último estágio da experiência pré-cadastro alcançado pelo visitante (dna | previews | signup) — usado só para restaurar a tela certa após refresh, nunca para controle de acesso (isso continua sendo status/claimed_at/expires_at).';
