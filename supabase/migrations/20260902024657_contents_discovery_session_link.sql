-- Bloco 5 do redesenho de onboarding: liga os conteúdos promovidos do
-- claim de volta à sessão de Discovery que os originou. Reaproveita
-- `contents` (existente) — nenhuma tabela nova. Esta coluna tem 2
-- papéis: (1) rastreabilidade/auditoria (de onde veio esse rascunho);
-- (2) idempotência real do claim — antes de promover as 3 sugestões em
-- contents, o claim verifica se já existe alguma linha com este
-- discovery_session_id; se sim, não promove de novo. Isso garante a
-- garantia no backend (não só no guard de React do useDiscoveryClaimOnLogin).
alter table public.contents
  add column discovery_session_id uuid references public.pre_onboarding_sessions(id) on delete set null;

create index if not exists idx_contents_discovery_session_id on public.contents (discovery_session_id) where discovery_session_id is not null;

comment on column public.contents.discovery_session_id is
  'Sessão de Discovery pré-cadastro (pre_onboarding_sessions) que originou este conteúdo como sugestão/rascunho no claim — null para conteúdo criado por qualquer outro caminho. Usado para idempotência do claim (nunca promove duas vezes a mesma sessão).';
