-- Permite ao frontend vincular uma geração de IA ao conteúdo salvo como
-- rascunho, sem expor UPDATE direto em ai_generations (mesmo padrão de
-- soft_delete_content: validação de permissão dentro de uma função
-- SECURITY DEFINER, nunca um UPDATE cru vindo do cliente).
create or replace function link_ai_generation_content(p_generation_id uuid, p_content_id uuid)
returns ai_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generation ai_generations;
  v_content contents;
begin
  select * into v_generation from ai_generations where id = p_generation_id;
  if v_generation is null then
    raise exception 'Geração não encontrada.';
  end if;
  if not is_workspace_member(v_generation.workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_content from contents where id = p_content_id;
  if v_content is null or v_content.workspace_id <> v_generation.workspace_id then
    raise exception 'Conteúdo inválido para esta geração.';
  end if;

  update ai_generations
    set content_id = p_content_id, updated_at = now()
    where id = p_generation_id
    returning * into v_generation;

  return v_generation;
end;
$$;

revoke all on function link_ai_generation_content(uuid, uuid) from public, anon;
grant execute on function link_ai_generation_content(uuid, uuid) to authenticated;
