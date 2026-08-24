-- Fase 7 — Publicação real. instagram_publications.status hoje
-- reaproveita content_status (rascunho/em_revisao/...), que não tem
-- granularidade para diagnosticar uma tentativa de publicação. Criamos
-- um enum técnico dedicado (fonte de verdade da TENTATIVA de
-- publicação) e migramos os dados existentes com mapeamento explícito
-- — sem assumir que a tabela está vazia. contents.status continua
-- sendo a fonte de verdade do NEGÓCIO (visão do usuário).
create type public.instagram_publication_status as enum (
  'pending', 'processing', 'container_created', 'publishing', 'published', 'failed', 'cancelled'
);

-- Mapeamento explícito dos valores herdados de content_status:
--   'agendado'  -> 'pending'    (ainda não reivindicado pelo worker)
--   'publicado' -> 'published'
--   'falhou'    -> 'failed'
--   qualquer outro valor (não deveria ocorrer, já que só estas 3 eram
--   usadas por esta coluna) -> 'pending', o estado mais seguro: nunca
--   perde a linha, na pior hipótese ela é reprocessada pelo worker.
alter table public.instagram_publications add column status_new public.instagram_publication_status;

update public.instagram_publications set status_new = case status::text
  when 'agendado' then 'pending'
  when 'publicado' then 'published'
  when 'falhou' then 'failed'
  else 'pending'
end::public.instagram_publication_status;

do $$
begin
  if exists (select 1 from public.instagram_publications where status_new is null) then
    raise exception 'Migração de instagram_publications.status abortada: existem linhas sem mapeamento de status_new.';
  end if;
end;
$$;

alter table public.instagram_publications alter column status_new set not null;
alter table public.instagram_publications alter column status_new set default 'pending';

alter table public.instagram_publications drop column status;
alter table public.instagram_publications rename column status_new to status;

comment on column public.instagram_publications.status is 'Estado técnico da TENTATIVA de publicação (instagram_publication_status) — distinto de contents.status, que é a visão de negócio.';

-- Novas colunas necessárias para o worker (claim atômico, reconciliação,
-- retry, idempotência, diagnóstico) e para o asset imutável por versão.
alter table public.instagram_publications
  add column ig_container_id text,
  add column permalink text,
  add column content_version_id uuid references public.content_versions(id) on delete set null,
  add column rendered_asset_paths text[] not null default '{}',
  add column attempt_count integer not null default 0,
  add column last_attempt_at timestamptz,
  add column next_retry_at timestamptz,
  add column last_error_code text,
  add column last_error_message text,
  add column claimed_at timestamptz,
  add column requested_by uuid references public.profiles(id) on delete set null;

comment on column public.instagram_publications.rendered_asset_paths is 'Paths no bucket privado content-assets do(s) PNG(s) já renderizados para ESTA publicação — imutáveis, vinculados a content_version_id, nunca sobrescritos por edição posterior do conteúdo.';
comment on column public.instagram_publications.claimed_at is 'Lock atômico: setado só pelo claim_instagram_publications() do worker. Reagendar/cancelar só são permitidos enquanto claimed_at é null.';
comment on column public.instagram_publications.content_version_id is 'Versão exata de contents/content_pages que foi renderizada e publicada — nunca republica silenciosamente uma versão diferente da aprovada.';

create index instagram_publications_status_idx on public.instagram_publications(status);

-- No máximo 1 publicação ATIVA (não terminal) por conteúdo por vez —
-- evita agendar/publicar-agora duas vezes em cima do mesmo conteúdo
-- enquanto uma tentativa já está em andamento. Republicar depois de um
-- estado terminal (published/failed/cancelled) cria uma nova linha
-- normalmente (histórico preservado, nunca sobrescrito).
create unique index instagram_publications_one_active_per_content
  on public.instagram_publications(content_id)
  where status in ('pending', 'processing', 'container_created', 'publishing');
