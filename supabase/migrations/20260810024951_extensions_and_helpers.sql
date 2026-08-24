-- Extensões
create extension if not exists "pgcrypto" with schema public;

-- Helper genérico de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Atualiza updated_at automaticamente em UPDATE.';
