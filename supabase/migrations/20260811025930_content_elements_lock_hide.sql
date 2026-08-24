-- Fase 5 — Editor Visual: bloquear/ocultar são estados por elemento
-- (não visuais, não fazem sentido dentro de "style"), usados pelo painel
-- de camadas. Sem tabela paralela — a ordem de camadas já é derivada de
-- z_index, aqui só adicionamos os dois booleans que faltavam.
alter table content_elements
  add column locked boolean not null default false,
  add column hidden boolean not null default false;
