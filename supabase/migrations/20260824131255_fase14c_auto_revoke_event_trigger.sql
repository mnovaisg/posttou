-- Fase 14C, ajuste final — ALTER DEFAULT PRIVILEGES FOR ROLE postgres
-- IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ... foi aplicado
-- (confirmado em pg_default_acl), mas testado empiricamente e não
-- surtiu efeito nas funções criadas depois — o catálogo continua
-- gravando proacl NULL, que o Postgres interpreta como "PUBLIC tem
-- EXECUTE" (comportamento hardcoded de funções). Isso é uma
-- particularidade deste ambiente Postgres 17/Supabase que não vale a
-- pena investigar mais a fundo — a solução abaixo é mais robusta de
-- qualquer forma, porque não depende de acldefault().
--
-- Event trigger: roda depois de CADA CREATE FUNCTION/PROCEDURE no schema
-- public e revoga EXECUTE de public/anon/authenticated/service_role
-- incondicionalmente. Qualquer GRANT explícito feito DEPOIS (sempre numa
-- instrução separada, como já fazemos em toda migration) continua
-- funcionando normalmente — só o grant AUTOMÁTICO do Postgres é anulado.
create or replace function public._auto_revoke_new_function_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
      and schema_name = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', obj.object_identity);
  end loop;
exception when others then
  -- Nunca deixa a criação da função falhar por causa deste trigger de
  -- segurança; loga um aviso e segue.
  raise warning 'auto_revoke_new_function_grants: falha ao revogar grants automáticos: %', sqlerrm;
end;
$$;

drop event trigger if exists auto_revoke_new_function_grants;
create event trigger auto_revoke_new_function_grants
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function public._auto_revoke_new_function_grants();
