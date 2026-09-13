-- Auditoria pré-lançamento: _forbid_plan_change_history_mutation (trigger
-- de plan_change_history) não tinha search_path fixo (function_search_path_mutable).
-- Puramente aditivo: só adiciona `set search_path to 'public'`, a lógica
-- (raise exception para bloquear UPDATE/DELETE) permanece idêntica.
create or replace function public._forbid_plan_change_history_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'PLAN_CHANGE_HISTORY_IS_APPEND_ONLY';
end;
$$;
