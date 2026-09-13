
-- Bloco 8 — Estilo da Marca. Reaproveita brand_profiles.visual_identity
-- (jsonb já existente, sem coluna/tabela paralela) para as novas
-- escolhas estruturadas: primary_color/background_color/text_color
-- (hex) e image_style/design_style (enums fechados, texto livre no
-- jsonb — validação de vocabulário fica no frontend, mesmo padrão já
-- usado por visual_style/colors nesse mesmo jsonb). Nenhuma migração de
-- schema é necessária para esses campos (jsonb é schemaless); só
-- documentamos via comment on column.
comment on column public.brand_profiles.visual_identity is
  'Bloco 8: além de colors[]/typography/visual_style/references (livre), agora também carrega primary_color/background_color/text_color (hex #rrggbb, validado no frontend) e image_style (fotografico|ilustracao|3d) / design_style (moderno|editorial|pop|minimalista|impactante) — escolhas estruturadas que alimentam a futura direção de geração visual, não são só estado cosmético.';

-- Biblioteca da Marca — assets reutilizáveis do workspace (fotos,
-- produtos, pessoas, ambientes, logos, outros). Reaproveita o bucket
-- privado já existente `brand-assets` (só uma pasta nova
-- `{workspace_id}/library/{category}/...`) — a policy de storage já é
-- genérica por workspace_id (primeiro segmento do path), então nenhuma
-- mudança de bucket/storage RLS é necessária.
create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null default 'outro' check (category in ('foto', 'produto', 'pessoa', 'ambiente', 'logo', 'outro')),
  title text,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_brand_assets_workspace_id on public.brand_assets (workspace_id);

alter table public.brand_assets enable row level security;

create policy "brand_assets_select_members"
  on public.brand_assets for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "brand_assets_insert_editors"
  on public.brand_assets for insert
  to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

create policy "brand_assets_delete_editors"
  on public.brand_assets for delete
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

grant select, insert, delete on public.brand_assets to authenticated;

comment on table public.brand_assets is
  'Bloco 8 — Biblioteca da Marca: assets reutilizáveis do workspace (categoria foto/produto/pessoa/ambiente/logo/outro), arquivo em storage.objects no bucket privado brand-assets (path {workspace_id}/library/{category}/{uuid}.{ext}). Upload/visualização/remoção — sem update por enquanto.';
