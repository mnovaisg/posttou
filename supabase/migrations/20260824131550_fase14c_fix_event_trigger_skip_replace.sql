-- Bug real no próprio event trigger criado nesta fase: CREATE OR REPLACE
-- FUNCTION dispara o mesmo command tag 'CREATE FUNCTION' de uma criação
-- nova — a versão anterior revogava incondicionalmente, destruindo os
-- grants de uma função EXISTENTE só porque ela foi recriada (aconteceu
-- de verdade, ver migration anterior de correção). Corrige checando
-- pg_proc.proacl: só age quando é NULL (função genuinamente nova, ainda
-- sem nenhum grant explícito — é exatamente aí que o Postgres aplicaria
-- o fallback "PUBLIC tem EXECUTE"). Numa substituição de função
-- existente, proacl já teria os grants explícitos preservados
-- (non-null) e o trigger não mexe em nada.
create or replace function public._auto_revoke_new_function_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  obj record;
  current_acl aclitem[];
begin
  for obj in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
      and schema_name = 'public'
  loop
    select proacl into current_acl from pg_proc where oid = obj.objid;
    if current_acl is null then
      execute format('revoke execute on function %s from public, anon, authenticated, service_role', obj.object_identity);
    end if;
  end loop;
exception when others then
  raise warning 'auto_revoke_new_function_grants: falha ao revogar grants automáticos: %', sqlerrm;
end;
$$;
