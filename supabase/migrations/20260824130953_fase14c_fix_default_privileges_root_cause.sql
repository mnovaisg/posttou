-- Fase 14C, ajuste final — causa raiz do bug repetido (14B e 14C): toda
-- migration é aplicada pela role `postgres` (confirmado via proowner das
-- funções recentes), e o projeto já tinha, desde o provisionamento,
-- entradas em pg_default_acl concedendo EXECUTE em funções futuras a
-- anon/authenticated/service_role automaticamente:
--   defaclrole=postgres, defaclnamespace=public, defaclobjtype='f',
--   defaclacl={postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Isso explica por que toda função nova "nascia aberta" mesmo antes de eu
-- rodar qualquer REVOKE manual.
--
-- Corrige na raiz: nenhuma role além do owner (postgres) recebe EXECUTE
-- por padrão em função nova no schema public daqui pra frente. Todo
-- acesso passa a exigir GRANT explícito na própria migration que cria a
-- função — mesma disciplina que já vínhamos seguindo manualmente, agora
-- garantida pelo Postgres em vez de depender de eu lembrar toda vez.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
