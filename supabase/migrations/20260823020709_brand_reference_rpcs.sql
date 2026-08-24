-- Fase 12 — RPCs de referência (owner/admin apenas — ajuste 4, V1 sem
-- "Editor sugere").
create or replace function public.add_brand_reference(
  p_workspace_id uuid,
  p_handle text,
  p_reference_type text default null,
  p_liked_aspects text[] default '{}',
  p_notes text default null
)
returns public.brand_reference_profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_handle text;
  v_count integer;
  v_row public.brand_reference_profiles;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode adicionar referências.';
  end if;

  v_handle := lower(trim(both '@ ' from coalesce(p_handle, '')));
  v_handle := regexp_replace(v_handle, '^https?://(www\.)?instagram\.com/', '', 'i');
  v_handle := regexp_replace(v_handle, '/.*$', '');
  if v_handle = '' or v_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Handle inválido. Use letras, números, ponto ou underscore.';
  end if;

  select count(*) into v_count from public.brand_reference_profiles where workspace_id = p_workspace_id and removed_at is null;
  if v_count >= 5 then
    raise exception 'Máximo de 5 referências ativas por workspace.';
  end if;

  insert into public.brand_reference_profiles (workspace_id, handle, reference_type, liked_aspects, notes, status, created_by)
  values (p_workspace_id, v_handle, p_reference_type, coalesce(p_liked_aspects, '{}'), p_notes, 'manual', auth.uid())
  on conflict (workspace_id, lower(handle)) where removed_at is null
  do update set reference_type = excluded.reference_type, liked_aspects = excluded.liked_aspects, notes = excluded.notes, updated_at = now()
  returning * into v_row;

  perform public.log_audit_event(p_workspace_id, 'brand_reference_added', 'brand_reference_profiles', v_row.id, jsonb_build_object('handle', v_row.handle));

  return v_row;
end;
$function$;

revoke all on function public.add_brand_reference(uuid, text, text, text[], text) from public, anon;
grant execute on function public.add_brand_reference(uuid, text, text, text[], text) to authenticated;

create or replace function public.remove_brand_reference(p_reference_id uuid)
returns public.brand_reference_profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.brand_reference_profiles;
begin
  select * into v_row from public.brand_reference_profiles where id = p_reference_id;
  if v_row.id is null then
    raise exception 'Referência não encontrada.';
  end if;
  if not public.has_workspace_role(v_row.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode remover referências.';
  end if;

  update public.brand_reference_profiles set removed_at = now(), updated_at = now() where id = p_reference_id
  returning * into v_row;

  perform public.log_audit_event(v_row.workspace_id, 'brand_reference_removed', 'brand_reference_profiles', v_row.id, jsonb_build_object('handle', v_row.handle));

  return v_row;
end;
$function$;

revoke all on function public.remove_brand_reference(uuid) from public, anon;
grant execute on function public.remove_brand_reference(uuid) to authenticated;
