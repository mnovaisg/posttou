alter table public.instagram_publications
  add column carousel_child_container_ids text[] not null default '{}';

comment on column public.instagram_publications.carousel_child_container_ids is 'IDs dos containers filhos do carrossel já criados na Meta (Fase 7) — permite reconciliar em novas tentativas sem recriar containers já existentes. ig_container_id guarda o container FINAL a publicar (imagem única, ou o container pai do carrossel depois de criado).';
