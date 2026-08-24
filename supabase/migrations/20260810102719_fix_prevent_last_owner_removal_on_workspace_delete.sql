-- Bug encontrado em teste manual: a trigger bloqueava até a exclusão do
-- workspace inteiro (DELETE FROM workspaces cascade -> workspace_members),
-- porque também dispara nesse cascade. Corrigido para permitir quando o
-- workspace referenciado já não existe mais (ou seja, está sendo excluído).
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners int;
  workspace_still_exists boolean;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then

    select exists (select 1 from public.workspaces where id = old.workspace_id) into workspace_still_exists;

    if workspace_still_exists then
      select count(*) into remaining_owners
      from public.workspace_members
      where workspace_id = old.workspace_id
        and role = 'owner'
        and id <> old.id;

      if remaining_owners = 0 then
        raise exception 'O workspace precisa de ao menos um owner.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
