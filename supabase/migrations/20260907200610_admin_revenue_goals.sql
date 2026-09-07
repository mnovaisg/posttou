-- Bloco Dashboard Executivo do Admin: meta de receita mensal, aprovada pelo
-- usuário como estrutura mínima. Uma meta por mês (month = primeiro dia do mês,
-- 'YYYY-MM-01'), somente platform_admin pode ler/escrever, não interfere em
-- billing/subscriptions/Asaas — é só um valor de referência (goal_cents) para
-- comparar contra a receita já realizada (fonte real: admin_financial_summary_system).
create table public.admin_revenue_goals (
  month date primary key,
  goal_cents bigint not null check (goal_cents >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_revenue_goals_month_is_first_day check (month = date_trunc('month', month)::date)
);

alter table public.admin_revenue_goals enable row level security;
revoke all on public.admin_revenue_goals from anon, authenticated;
-- Nenhuma policy criada: acesso é deny-all direto na tabela, só via RPCs
-- SECURITY DEFINER abaixo (mesmo padrão já usado no resto do Admin).

create or replace function public.admin_set_revenue_goal_system(p_month date, p_goal_cents bigint)
returns public.admin_revenue_goals
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_row public.admin_revenue_goals;
begin
  perform public._require_platform_admin();

  if p_goal_cents < 0 then
    raise exception 'GOAL_CENTS_NEGATIVE';
  end if;

  insert into public.admin_revenue_goals (month, goal_cents, created_by)
  values (v_month, p_goal_cents, auth.uid())
  on conflict (month) do update
    set goal_cents = excluded.goal_cents,
        updated_at = now()
  returning * into v_row;

  perform public.log_audit_event(null, 'admin_revenue_goal_set', 'admin_revenue_goal', null, jsonb_build_object('month', v_month, 'goal_cents', p_goal_cents));

  return v_row;
end;
$function$;

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

  return v_row;
end;
$function$;

revoke all on function public.admin_set_revenue_goal_system(date, bigint) from public;
grant execute on function public.admin_set_revenue_goal_system(date, bigint) to authenticated;
revoke all on function public.admin_get_revenue_goal_system(date) from public;
grant execute on function public.admin_get_revenue_goal_system(date) to authenticated;
