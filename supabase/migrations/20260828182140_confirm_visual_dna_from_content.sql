-- Etapa 3, Decisão 2 (Opção A) — confirma o DNA Visual a partir da
-- interpretação textual da própria arte do primeiro conteúdo, sem gerar
-- uma imagem dedicada nem consumir uma rodada de visual_dna_option_sets.
-- Espelha exatamente a lógica de confirm_visual_dna_option (mesmo lock,
-- mesma troca active->superseded, mesma nova versão), só que a origem
-- dos atributos é um objeto validado no servidor (Edge Function), não
-- uma linha de visual_dna_options.
create or replace function public.confirm_visual_dna_from_content(
  p_workspace_id uuid,
  p_attributes jsonb,
  p_based_on_content_id uuid default null
)
returns public.brand_visual_dna
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next_version integer;
  v_row public.brand_visual_dna;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Só owner/admin pode confirmar o DNA visual.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 2));

  update public.brand_visual_dna set status = 'superseded' where workspace_id = p_workspace_id and status = 'active';

  select coalesce(max(version), 0) + 1 into v_next_version from public.brand_visual_dna where workspace_id = p_workspace_id;

  insert into public.brand_visual_dna (workspace_id, version, based_on_option_id, reference_ids, attributes, confirmed_by)
  select
    p_workspace_id, v_next_version, null,
    coalesce((select array_agg(id) from public.brand_reference_profiles where workspace_id = p_workspace_id and removed_at is null), '{}'),
    p_attributes, auth.uid()
  returning * into v_row;

  perform public.log_audit_event(p_workspace_id, 'visual_dna_confirmed_from_content', 'brand_visual_dna', v_row.id,
    jsonb_build_object('version', v_row.version, 'based_on_content_id', p_based_on_content_id));

  return v_row;
end;
$function$;

revoke all on function public.confirm_visual_dna_from_content(uuid, jsonb, uuid) from public, anon;
grant execute on function public.confirm_visual_dna_from_content(uuid, jsonb, uuid) to authenticated;
