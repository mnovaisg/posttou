-- Função descartável só para provar que o ALTER DEFAULT PRIVILEGES
-- funcionou — removida na mesma sessão, logo depois de verificada.
create function public.__test_default_privileges_disposable()
returns text
language sql
as $$ select 'ok'; $$;
