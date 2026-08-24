-- Fase 13 — correção encontrada no teste real: sync_content_page_visual_asset
-- atualizava content_pages.visual_asset_status='ready' mas NUNCA inseria o
-- elemento 'image' de fato na página — a imagem gerada ficava só em
-- ai_generations/Storage, sem nunca chegar ao Editor Visual (ajuste 9: "a
-- arte automática precisa chegar ao mesmo Editor Visual existente"). Corrige
-- inserindo o elemento full-bleed (z_index 0, atrás do texto que já é
-- criado com z_index 1) — mesma estrutura que o fluxo manual do Editor já
-- usa (content_elements type='image', content={path}).
create or replace function public.sync_content_page_visual_asset()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.content_pages;
  v_new_status public.content_visual_asset_status;
  v_asset_path text;
begin
  if new.status not in ('success', 'failed') or old.status is distinct from 'processing' then
    return new;
  end if;

  select * into v_page from public.content_pages where visual_ai_generation_id = new.id for update;
  if v_page.id is null then
    return new;
  end if;

  v_new_status := case when new.status = 'success' then 'ready' else 'failed' end;
  update public.content_pages set visual_asset_status = v_new_status, updated_at = now() where id = v_page.id;

  if new.status = 'success' then
    v_asset_path := new.result_asset_paths[1];
    if v_asset_path is not null and not exists (
      select 1 from public.content_elements where page_id = v_page.id and type = 'image' and content ->> 'path' = v_asset_path
    ) then
      insert into public.content_elements (page_id, type, position_x, position_y, width, height, rotation, z_index, content, style)
      values (
        v_page.id, 'image', 0, 0, v_page.width, v_page.height, 0, 0,
        jsonb_build_object('path', v_asset_path),
        jsonb_build_object('opacity', 1)
      );
    end if;
  end if;

  perform public._pilot_submit_content_if_visual_complete(v_page.content_id);

  return new;
end;
$function$;
