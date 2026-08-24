-- Fase 13 — Arte Pronta Automática: schema. Reaproveita ai_generations
-- integralmente para o histórico/estado de CADA tentativa de imagem (item
-- 4 da missão) — as colunas novas em content_pages só guardam o estado
-- ATUAL da página (not_requested|pending|generating|ready|failed) e um
-- ponteiro pra tentativa corrente, pra permitir retry sem duplicar
-- conteúdo nem reconstruir o estado a partir do histórico toda vez.
create type public.content_visual_asset_status as enum ('not_requested', 'pending', 'generating', 'ready', 'failed');

alter table public.content_pages
  add column visual_asset_status public.content_visual_asset_status not null default 'not_requested',
  add column visual_ai_generation_id uuid references public.ai_generations(id) on delete set null,
  add column visual_generation_attempts integer not null default 0;

create index content_pages_visual_asset_status_idx on public.content_pages (visual_asset_status) where visual_asset_status in ('pending', 'generating', 'failed');

comment on column public.content_pages.visual_asset_status is 'Fase 13: estado da arte automática desta página — independente de contents.status (item 4: não usar só contents.status pra representar isso).';
comment on column public.content_pages.visual_ai_generation_id is 'Aponta para a tentativa de geração de imagem ATUAL (mais recente) desta página em ai_generations — histórico completo de tentativas fica em ai_generations, nunca duplicado aqui.';

alter table public.pilot_settings add column auto_generate_art boolean not null default false;
comment on column public.pilot_settings.auto_generate_art is 'Fase 13, ajuste 2: gera arte automaticamente pra cada conteúdo do Piloto. Default false — nunca muda comportamento de workspace existente silenciosamente; ativado explicitamente (ou sugerido, nunca forçado, na configuração inicial quando já existe DNA Visual).';
