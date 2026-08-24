
-- Correção do fix anterior: current_user dentro de uma função
-- SECURITY DEFINER é sempre o DONO da função ('postgres'), nunca o
-- chamador — testado e confirmado empiricamente, invalidando a
-- abordagem anterior (que continuava falhando mesmo via service_role
-- real). O sinal correto, confirmado por teste real com os dois tipos
-- de chamador, é a claim "role" dentro da GUC request.jwt.claims — que o
-- PostgREST/Supabase seta a partir do JWT já validado, antes de invocar
-- a função, e que o chamador não consegue forjar (não é lido de nenhum
-- parâmetro/payload da chamada).
create or replace function public.start_pilot_generation(p_plan_id uuid)
returns pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if v_jwt_role <> 'service_role' and not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Sem permissão para iniciar geração deste plano.';
  end if;
  if v_plan.status <> 'approved' then
    raise exception 'Plano precisa estar aprovado para gerar conteúdo (status atual: %).', v_plan.status;
  end if;

  update public.pilot_plans set status = 'generating', updated_at = now() where id = p_plan_id returning * into v_plan;
  return v_plan;
end;
$function$;
