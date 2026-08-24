-- Fase 13, ajuste 5 — o orçamento prévio do lote (ajuste 2 da Fase 9:
-- calculado ANTES de reivindicar qualquer item) passa a somar o custo da
-- arte quando auto_generate_art está ligado, pra nunca gerar o texto e só
-- depois descobrir que não havia crédito pra imagem. Carrossel usa o
-- MÁXIMO de slides permitido pelo prompt (8 — ver prompts.ts) como
-- estimativa conservadora; o crédito real de cada imagem ainda é cobrado
-- individualmente em tempo de geração (consume_credits_system), então uma
-- estimativa conservadora nunca trava o lote por excesso de cautela real —
-- só evita começar um lote que já se sabe, de antemão, que não caberia.
create or replace function public.pilot_estimate_batch_cost(p_plan_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
stable
as $function$
declare
  v_text_cost bigint;
  v_image_cost bigint;
  v_workspace_id uuid;
  v_auto_art boolean;
  v_post_items integer;
  v_carousel_items integer;
begin
  select coalesce(sum(c.credit_cost), 0)
  into v_text_cost
  from public.pilot_plan_items pi
  join public.ai_operation_costs c on c.generation_type = (case pi.format when 'post' then 'post_unico' when 'carrossel' then 'carrossel' end)::public.ai_generation_type
  where pi.pilot_plan_id = p_plan_id and pi.status = 'approved';

  select workspace_id into v_workspace_id from public.pilot_plans where id = p_plan_id;

  if v_workspace_id is null then
    return coalesce(v_text_cost, 0);
  end if;

  select auto_generate_art into v_auto_art from public.pilot_settings where workspace_id = v_workspace_id;
  if not coalesce(v_auto_art, false) then
    return coalesce(v_text_cost, 0);
  end if;

  select credit_cost into v_image_cost from public.ai_operation_costs where generation_type = 'imagem';

  select
    count(*) filter (where format = 'post'),
    count(*) filter (where format = 'carrossel')
  into v_post_items, v_carousel_items
  from public.pilot_plan_items
  where pilot_plan_id = p_plan_id and status = 'approved';

  return coalesce(v_text_cost, 0) + (coalesce(v_post_items, 0) * coalesce(v_image_cost, 0)) + (coalesce(v_carousel_items, 0) * 8 * coalesce(v_image_cost, 0));
end;
$function$;

comment on function public.pilot_estimate_batch_cost(uuid) is 'Custo total esperado (texto + arte quando auto_generate_art) dos itens aprovados ainda não gerados — calculado ANTES de iniciar o lote. Carrossel estima pelo máximo de 8 slides (conservador); a cobrança real é sempre por imagem individual.';

revoke all on function public.pilot_estimate_batch_cost(uuid) from public, anon;
grant execute on function public.pilot_estimate_batch_cost(uuid) to authenticated, service_role;
