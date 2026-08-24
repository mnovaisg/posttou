-- Fase 5 — Editor Visual: bucket privado para mídia de conteúdo (upload
-- manual + imagens geradas por IA). Mesmo padrão do brand-assets: path
-- {workspace_id}/{content_id}/..., workspace derivado do path via
-- storage_path_workspace_id (nunca confiar em workspace_id vindo do
-- cliente), acesso controlado por has_workspace_role/is_workspace_member.
insert into storage.buckets (id, name, public)
values ('content-assets', 'content-assets', false)
on conflict (id) do nothing;

create policy content_assets_select_members
  on storage.objects for select
  to authenticated
  using (bucket_id = 'content-assets' and is_workspace_member(storage_path_workspace_id(name)));

create policy content_assets_insert_editors
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'content-assets' and has_workspace_role(storage_path_workspace_id(name), array['owner','admin','editor']::workspace_role[]));

create policy content_assets_update_editors
  on storage.objects for update
  to authenticated
  using (bucket_id = 'content-assets' and has_workspace_role(storage_path_workspace_id(name), array['owner','admin','editor']::workspace_role[]))
  with check (bucket_id = 'content-assets' and has_workspace_role(storage_path_workspace_id(name), array['owner','admin','editor']::workspace_role[]));

create policy content_assets_delete_editors
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'content-assets' and has_workspace_role(storage_path_workspace_id(name), array['owner','admin','editor']::workspace_role[]));
