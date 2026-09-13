
-- Bloco 10: Piloto Automático — agenda semanal explícita (slot = weekday+horário
-- opcionalmente com diretriz de conteúdo) e opção "sempre aguardar minha
-- aprovação". Reaproveita 100% do pipeline pilot_plans/pilot_plan_items já
-- existente — a agenda só passa a alimentar a construção de slots do
-- pilot-plan-generate, substituindo o cross-product allowed_weekdays x
-- preferred_times.default.

alter table public.pilot_settings
  add column if not exists always_require_approval boolean not null default true;

comment on column public.pilot_settings.always_require_approval is
  'Quando true (padrão), todo conteúdo gerado pelo Piloto fica em revisão/rascunho — nunca publica sozinho. Quando false, o Piloto tenta publicação automática apenas se todos os pré-requisitos (Instagram conectado, permissões válidas, infraestrutura de publicação pronta) forem satisfeitos; se qualquer um faltar, cai em segurança para revisão manual.';

create table if not exists public.pilot_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  weekday int2 not null check (weekday between 0 and 6), -- 0=domingo..6=sábado, mesma convenção de pilot_settings.allowed_weekdays
  time_of_day time not null,
  directive text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, weekday, time_of_day)
);

comment on table public.pilot_schedule_slots is
  'Bloco 10: agenda semanal do Piloto Automático — cada linha é 1 slot (1 conteúdo) num dia/horário fixo, com diretriz opcional que chega ao prompt de geração via pilot_plan_items.directive.';

create index if not exists pilot_schedule_slots_workspace_idx on public.pilot_schedule_slots (workspace_id);

alter table public.pilot_schedule_slots enable row level security;

drop policy if exists pilot_schedule_slots_select_members on public.pilot_schedule_slots;
create policy pilot_schedule_slots_select_members on public.pilot_schedule_slots
  for select using (public.is_workspace_member(workspace_id));

alter table public.pilot_plan_items add column if not exists directive text;
comment on column public.pilot_plan_items.directive is
  'Diretriz de conteúdo copiada do slot da agenda semanal (pilot_schedule_slots.directive) no momento da geração do plano — chega ao prompt de pilot-plan-generate e pilot-content-generate.';

create or replace function public.upsert_pilot_schedule_slot(
  p_workspace_id uuid,
  p_weekday int,
  p_time_of_day time,
  p_directive text default null,
  p_slot_id uuid default null
) returns public.pilot_schedule_slots
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.pilot_schedule_slots;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner','admin','editor']::public.workspace_role[]) then
    raise exception 'Só owner/admin/editor pode configurar a agenda do Piloto.';
  end if;
  if p_weekday < 0 or p_weekday > 6 then
    raise exception 'Dia da semana inválido: % (use 0=domingo..6=sábado).', p_weekday;
  end if;

  begin
    if p_slot_id is not null then
      update public.pilot_schedule_slots
      set weekday = p_weekday, time_of_day = p_time_of_day, directive = nullif(trim(p_directive), ''), updated_at = now()
      where id = p_slot_id and workspace_id = p_workspace_id
      returning * into v_row;
      if v_row.id is null then
        raise exception 'Slot não encontrado.';
      end if;
    else
      insert into public.pilot_schedule_slots (workspace_id, weekday, time_of_day, directive)
      values (p_workspace_id, p_weekday, p_time_of_day, nullif(trim(p_directive), ''))
      returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um slot nesse dia e horário.';
  end;

  perform public.log_audit_event(p_workspace_id, 'pilot_schedule_slot_saved', 'pilot_schedule_slots', v_row.id, jsonb_build_object('weekday', p_weekday, 'time_of_day', p_time_of_day));
  return v_row;
end;
$$;

create or replace function public.delete_pilot_schedule_slot(p_slot_id uuid) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.pilot_schedule_slots where id = p_slot_id;
  if v_workspace_id is null then
    return;
  end if;
  if not public.has_workspace_role(v_workspace_id, array['owner','admin','editor']::public.workspace_role[]) then
    raise exception 'Só owner/admin/editor pode configurar a agenda do Piloto.';
  end if;

  delete from public.pilot_schedule_slots where id = p_slot_id;
  perform public.log_audit_event(v_workspace_id, 'pilot_schedule_slot_removed', 'pilot_schedule_slots', p_slot_id, '{}'::jsonb);
end;
$$;

grant execute on function public.upsert_pilot_schedule_slot(uuid, int, time, text, uuid) to authenticated;
grant execute on function public.delete_pilot_schedule_slot(uuid) to authenticated;

-- check_pilot_activation_readiness: troca a checagem de allowed_weekdays
-- (não mais usada para agendar) por uma exigência de pelo menos 1 slot
-- válido na nova agenda semanal — validação no backend, não só no front.
create or replace function public.check_pilot_activation_readiness(p_workspace_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_settings public.pilot_settings;
  v_brand public.brand_profiles;
  v_balance bigint;
  v_min_cost bigint;
  v_slot_count int;
  v_missing text[] := '{}';
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = p_workspace_id;
  if v_settings.id is null then
    v_missing := v_missing || 'settings_not_created';
  end if;

  select * into v_brand from public.brand_profiles where workspace_id = p_workspace_id;
  if v_brand.id is null or v_brand.company_name is null or v_brand.description is null or v_brand.onboarding_completed_at is null then
    v_missing := v_missing || 'brand_dna_incomplete';
  end if;

  select count(*) into v_slot_count from public.pilot_schedule_slots where workspace_id = p_workspace_id;
  if coalesce(v_slot_count, 0) < 1 then
    v_missing := v_missing || 'schedule_not_set';
  end if;

  if v_settings.id is not null then
    if v_settings.allowed_formats is null or array_length(v_settings.allowed_formats, 1) is null then
      v_missing := v_missing || 'formats_not_set';
    end if;
    if v_settings.max_posts_per_window is null or v_settings.max_posts_per_window <= 0 then
      v_missing := v_missing || 'frequency_not_set';
    end if;
  end if;

  select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id;
  select min(credit_cost) into v_min_cost from public.ai_operation_costs where generation_type in ('post_unico', 'carrossel');
  if v_balance is null or v_min_cost is null or v_balance < v_min_cost then
    v_missing := v_missing || 'insufficient_credits';
  end if;

  return jsonb_build_object('ready', array_length(v_missing, 1) is null, 'missing', to_jsonb(v_missing));
end;
$function$;
