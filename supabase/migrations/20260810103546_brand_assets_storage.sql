-- =========================================================
-- STORAGE — bucket para logo/avatar/identidade visual da marca.
-- Convenção de caminho: {workspace_id}/{kind}/{arquivo}
-- kind ∈ ('logo', 'logo-secundaria', 'avatar', 'referencias')
--
-- Bucket público para leitura (logos precisam ser embutíveis em previews
-- e, futuramente, em publicações do Instagram, sem exigir token). Escrita
-- é sempre restrita por RLS a owner/admin/editor do workspace dono da pasta.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets', 'brand-assets', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
);

create or replace function public.storage_path_workspace_id(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select (storage.foldername(object_name))[1]::uuid;
$$;

create policy "brand_assets_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'brand-assets');

create policy "brand_assets_insert_editors"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'brand-assets'
    and public.has_workspace_role(
      public.storage_path_workspace_id(name),
      array['owner', 'admin', 'editor']::public.workspace_role[]
    )
  );

create policy "brand_assets_update_editors"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'brand-assets'
    and public.has_workspace_role(
      public.storage_path_workspace_id(name),
      array['owner', 'admin', 'editor']::public.workspace_role[]
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and public.has_workspace_role(
      public.storage_path_workspace_id(name),
      array['owner', 'admin', 'editor']::public.workspace_role[]
    )
  );

create policy "brand_assets_delete_editors"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'brand-assets'
    and public.has_workspace_role(
      public.storage_path_workspace_id(name),
      array['owner', 'admin', 'editor']::public.workspace_role[]
    )
  );
