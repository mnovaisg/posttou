-- Bloco: Assinatura Interna/Cortesia (QA, demonstração, App Review). Helper
-- único e reutilizável pra checar se uma assinatura está marcada como
-- interna (subscriptions.metadata->>'internal' = 'true'), usado por todos
-- os RPCs comerciais/financeiros que precisam excluir essas organizações
-- de MRR, ARR, receita, funil comercial, conversão, inadimplência,
-- projeções etc. Ponto único de verdade — evita divergência de filtro
-- entre os vários RPCs que leem subscriptions.
create or replace function public._is_internal_subscription(p_sub subscriptions)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce((p_sub.metadata->>'internal')::boolean, false);
$$;

revoke all on function public._is_internal_subscription(subscriptions) from public;
grant execute on function public._is_internal_subscription(subscriptions) to authenticated, service_role;
