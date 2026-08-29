-- Etapa 3 — custo separado para as ideias do onboarding (telemetria e
-- preço independentes do "Criar com IA" normal, mesmo preço inicial).
insert into public.ai_operation_costs (generation_type, credit_cost)
values ('ideias_onboarding', 3)
on conflict (generation_type) do nothing;

-- Fonte única de verdade das dimensões canônicas por formato (a
-- auditoria da Etapa 3 encontrou 2 tabelas TS independentes que podiam
-- divergir silenciosamente, além de nenhuma validação no banco). Esta
-- tabela é a autoridade; a UI continua com sua própria constante local
-- (mesmos valores) só para não depender de rede pra montar formulário.
create table public.content_format_dimensions (
  format public.content_format primary key,
  width integer not null check (width > 0),
  height integer not null check (height > 0)
);

insert into public.content_format_dimensions (format, width, height) values
  ('1:1', 1080, 1080),
  ('4:5', 1080, 1350),
  ('9:16', 1080, 1920);

alter table public.content_format_dimensions enable row level security;
create policy content_format_dimensions_select_all on public.content_format_dimensions
  for select to authenticated, anon using (true);
grant select on public.content_format_dimensions to authenticated, anon;

comment on table public.content_format_dimensions is
  'Etapa 3 — única fonte de verdade das dimensões canônicas por content_format. Preço/dimensão só mudam por migration (mesmo padrão de ai_operation_costs); nunca editável via API.';

-- Impede divergência silenciosa entre contents.format e content_pages
-- width/height daqui pra frente (achado real da auditoria: hoje elas
-- podem divergir sem nenhum erro).
create or replace function public.validate_content_page_dimensions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_format public.content_format;
  v_expected public.content_format_dimensions;
begin
  select format into v_format from public.contents where id = new.content_id;
  if v_format is null then
    return new;
  end if;

  select * into v_expected from public.content_format_dimensions where format = v_format;
  if v_expected.format is null then
    return new;
  end if;

  if new.width <> v_expected.width or new.height <> v_expected.height then
    raise exception 'content_pages.width/height (%,%) não corresponde ao formato % do conteúdo (esperado %x%).',
      new.width, new.height, v_format, v_expected.width, v_expected.height;
  end if;

  return new;
end;
$function$;

create trigger content_pages_validate_dimensions
before insert or update of width, height on public.content_pages
for each row execute function public.validate_content_page_dimensions();
