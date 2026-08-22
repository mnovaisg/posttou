-- =========================================================
-- Bug real encontrado em teste manual: a policy de SELECT de "contents"
-- filtra `deleted_at is null` — e o Postgres, ao processar um UPDATE sob
-- RLS, também exige que a linha resultante continue visível pela policy
-- de SELECT (não apenas pela policy de UPDATE). Como soft-delete torna a
-- própria linha invisível pela policy de SELECT, QUALQUER UPDATE direto
-- que grave deleted_at falha com "new row violates row-level security
-- policy", mesmo com uma policy de UPDATE totalmente permissiva.
--
-- Solução: mesmo padrão já usado em consume_credits/grant_credits — uma
-- função SECURITY DEFINER (dona = postgres, portanto ignora RLS) faz a
-- escrita, após validar explicitamente a permissão do chamador.
-- =========================================================
create or replace function public.soft_delete_content(p_content_id uuid)
returns public.contents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content public.contents;
begin
  select * into v_content from public.contents where id = p_content_id;

  if not found then
    raise exception 'Conteúdo não encontrado.';
  end if;

  if v_content.deleted_at is not null then
    raise exception 'Conteúdo já está excluído.';
  end if;

  if not public.has_workspace_role(v_content.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
    raise exception 'Sem permissão para excluir este conteúdo.';
  end if;

  update public.contents set deleted_at = now() where id = p_content_id returning * into v_content;

  return v_content;
end;
$$;

revoke execute on function public.soft_delete_content(uuid) from public, anon;
grant execute on function public.soft_delete_content(uuid) to authenticated;
