-- Fase 5: geração de imagem por IA reaproveita 100% a tabela ai_generations
-- da Fase 4 (mesmo fluxo de auditoria/custo/estorno). Só precisa de um
-- lugar para guardar o(s) resultado(s) já transferido(s) para o Storage
-- próprio do POSTTOU (nunca a URL temporária da Kie).
alter table ai_generations
  add column result_asset_paths text[] not null default '{}'::text[];

comment on column ai_generations.result_asset_paths is 'Paths no bucket privado content-assets, após transferência do resultado do provider (nunca URL temporária de terceiro).';

insert into ai_operation_costs (generation_type, credit_cost) values ('imagem', 15);
