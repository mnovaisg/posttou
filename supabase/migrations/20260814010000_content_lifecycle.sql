-- =========================================================
-- FASE 3 — Meu Conteúdo: ciclo de vida real do conteúdo.
--
-- Adiciona o estado "rejeitado" (gap identificado na revisão da Fase 2),
-- motivo de rejeição, rastreabilidade de duplicação, soft-delete, e uma
-- máquina de estados aplicada no banco (não só no frontend) via trigger —
-- assim nenhuma transição incoerente é possível mesmo com escrita direta
-- na tabela.
-- =========================================================

alter type public.content_status add value 'rejeitado' after 'em_revisao';

alter table public.contents
  add column rejection_reason text,
  add column duplicated_from uuid references public.contents (id) on delete set null,
  add column deleted_at timestamptz;

comment on column public.contents.rejection_reason is 'Motivo informado pelo approver ao rejeitar. Limpo automaticamente ao sair do status rejeitado.';
comment on column public.contents.duplicated_from is 'Aponta para o conteúdo original quando este registro nasceu de uma duplicação.';
comment on column public.contents.deleted_at is 'Soft-delete: conteúdo excluído nunca é removido fisicamente (preserva auditoria/histórico). NULL = ativo.';

create index contents_duplicated_from_idx on public.contents (duplicated_from) where duplicated_from is not null;
create index contents_deleted_at_idx on public.contents (workspace_id) where deleted_at is null;
