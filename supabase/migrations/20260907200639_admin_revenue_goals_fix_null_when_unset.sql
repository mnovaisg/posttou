-- admin_get_revenue_goal_system(p_month) usava `select ... into v_row` sem
-- checar FOUND: quando não existe meta pro mês, v_row fica uma linha com todos
-- os campos NULL (não a linha inteira NULL), e o cliente recebia um objeto
-- {month: null, goal_cents: null, ...} em vez de `null` puro — dificultando a
-- UI distinguir "mês sem meta cadastrada" de um objeto real. Corrigido
-- retornando NULL explicitamente quando não há linha.
create or replace function public.admin_get_revenue_goal_system(p_month date default null)
returns public.admin_revenue_goals
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_row public.admin_revenue_goals;
begin
  perform public._require_platform_admin();

  select * into v_row from public.admin_revenue_goals where month = v_month;

  if not found then
    return null;
  end if;

  return v_row;
end;
$function$;
