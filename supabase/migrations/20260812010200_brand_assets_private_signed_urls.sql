-- =========================================================
-- Correção pós-revisão da Fase 2: brand-assets deixa de ser público.
-- Nenhum arquivo hoje exige acesso público permanente — quando a
-- publicação no Instagram (Fase 6/7) precisar de uma URL alcançável
-- pelo Graph API, a Edge Function de publicação gera uma signed URL de
-- curta duração no momento da chamada, usando o service role.
-- =========================================================
update storage.buckets set public = false where id = 'brand-assets';

drop policy "brand_assets_public_read" on storage.objects;

create policy "brand_assets_select_members"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'brand-assets'
    and public.is_workspace_member(public.storage_path_workspace_id(name))
  );

-- As colunas armazenavam URL pública; agora armazenam apenas o path no
-- bucket privado, resolvido para signed URL sob demanda no frontend.
alter table public.brand_profiles rename column logo_url to logo_path;
alter table public.brand_profiles rename column secondary_logo_url to secondary_logo_path;
alter table public.brand_profiles rename column avatar_url to avatar_path;

comment on column public.brand_profiles.logo_path is 'Path do objeto no bucket privado brand-assets (não é URL pública). Resolver via createSignedUrl sob demanda.';
comment on column public.brand_profiles.secondary_logo_path is 'Path do objeto no bucket privado brand-assets.';
comment on column public.brand_profiles.avatar_path is 'Path do objeto no bucket privado brand-assets.';
