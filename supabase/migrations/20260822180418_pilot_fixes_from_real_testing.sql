-- Fase 9 — correções encontradas durante a bateria de testes reais
-- (assistido ponta a ponta, semi-auto, kill switch, créditos, papéis,
-- cross-workspace). Três bugs reais:
--
-- 1) add_pilot_plan_item: CASE sem cast para pilot_plan_item_status
--    (erro 42804 ao adicionar item manualmente ao plano).
-- 2) generation_key tinha UNIQUE global (sem filtro de status) —
--    bloqueava para sempre um novo plano no mesmo dia depois que o
--    anterior chegava a completed/cancelled. A garantia real de
--    "uma única geração lógica" já vem do índice parcial
--    pilot_plans_one_active_per_workspace_idx + do advisory lock.
-- 3) pilot_create_content: o worker de conteúdo inseria em `contents`
--    via .from('contents').insert() direto — o trigger de auditoria de
--    INSERT (audit_content_changes) chama log_audit_event, que exige o
--    marcador posttou.system_actor='pilot_worker' NA MESMA transação do
--    INSERT (set_config de uma chamada REST anterior não persiste).
--    Criada RPC dedicada que seta o marcador e insere na mesma função.

create or replace function public.add_pilot_plan_item(
  p_plan_id uuid,
  p_scheduled_for timestamptz,
  p_topic text,
  p_format public.content_type,
  p_editorial_role public.pilot_editorial_role,
  p_brand_pillar text default null,
  p_objective text default null,
  p_angle text default null
)
returns public.pilot_plan_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_settings public.pilot_settings;
  v_item public.pilot_plan_items;
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
    raise exception 'Sem permissão para adicionar item a este plano.';
  end if;
  if v_plan.status in ('completed', 'cancelled') then
    raise exception 'Plano em estado terminal, não pode receber novos itens.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = v_plan.workspace_id;
  if not (p_format = any(v_settings.allowed_formats)) then
    raise exception 'Formato % não está habilitado nas configurações do Piloto.', p_format;
  end if;
  if public.pilot_check_slot_conflict(v_plan.workspace_id, p_scheduled_for, null) then
    raise exception 'Já existe conteúdo ou item planejado neste horário.';
  end if;

  insert into public.pilot_plan_items (
    pilot_plan_id, workspace_id, scheduled_for, editorial_role, brand_pillar, objective, format, topic, angle,
    reason, status, source
  ) values (
    p_plan_id, v_plan.workspace_id, p_scheduled_for, p_editorial_role, p_brand_pillar, p_objective, p_format, p_topic, p_angle,
    'Adicionado manualmente pelo usuário.',
    (case when v_plan.status = 'approved' then 'approved' else 'planned' end)::public.pilot_plan_item_status,
    'manual'
  )
  returning * into v_item;

  perform public.log_audit_event(v_plan.workspace_id, 'pilot_plan_item_added', 'pilot_plan_items', v_item.id, '{}'::jsonb);
  return v_item;
end;
$function$;

-- generation_key não deve ser globalmente único ao longo do tempo — só
-- serve como rótulo de rastreabilidade (workspace_id:period_start).
alter table public.pilot_plans drop constraint if exists pilot_plans_generation_key_key;

-- Único caminho pelo qual o pilot_worker cria um contents novo.
create or replace function public.pilot_create_content(
  p_workspace_id uuid,
  p_type public.content_type,
  p_format public.content_format,
  p_title text,
  p_caption text,
  p_hashtags text[],
  p_cta text,
  p_pilot_plan_item_id uuid
)
returns public.contents
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_content public.contents;
begin
  perform set_config('posttou.system_actor', 'pilot_worker', true);

  insert into public.contents (workspace_id, type, format, title, origin, caption, hashtags, cta, pilot_plan_item_id)
  values (p_workspace_id, p_type, p_format, p_title, 'autopilot', p_caption, coalesce(p_hashtags, '{}'), p_cta, p_pilot_plan_item_id)
  returning * into v_content;

  return v_content;
end;
$function$;

comment on function public.pilot_create_content(uuid, public.content_type, public.content_format, text, text, text[], text, uuid) is 'Único caminho pelo qual o pilot_worker cria um contents novo — necessário porque audit_content_changes() (trigger de INSERT) chama log_audit_event, que exige o marcador de sistema na MESMA transação do INSERT.';

revoke all on function public.pilot_create_content(uuid, public.content_type, public.content_format, text, text, text[], text, uuid) from public, anon, authenticated;
grant execute on function public.pilot_create_content(uuid, public.content_type, public.content_format, text, text, text[], text, uuid) to service_role;
