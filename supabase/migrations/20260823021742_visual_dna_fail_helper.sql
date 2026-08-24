-- Fase 12 — RPC de falha total ANTES de qualquer ai_generations existir
-- (ex.: o estágio 1 de texto do brand-visual-dna-generate falhou/retornou
-- JSON inválido). sync_visual_dna_option_set só conclui uma rodada quando
-- todas as 3 opções têm ai_generation_id preenchido — se o estágio de texto
-- falhar antes de criar qualquer imagem, a rodada ficaria presa em
-- "generating" para sempre e o crédito nunca seria estornado. Esta função
-- cobre exatamente esse caminho, reaproveitando a mesma régua de estorno
-- único e idempotente.
create or replace function public.fail_visual_dna_generation(p_option_set_id uuid, p_reason text default null)
returns public.visual_dna_option_sets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_set public.visual_dna_option_sets;
  v_account public.credit_accounts;
  v_new_balance bigint;
begin
  select * into v_set from public.visual_dna_option_sets where id = p_option_set_id for update;
  if v_set.id is null then
    raise exception 'Rodada não encontrada.';
  end if;
  if not public.has_workspace_role(v_set.workspace_id, array['owner', 'admin']::public.workspace_role[]) and auth.uid() is not null then
    raise exception 'Sem permissão.';
  end if;
  if v_set.status <> 'generating' then
    return v_set;
  end if;

  update public.visual_dna_options set status = 'failed' where option_set_id = p_option_set_id and status = 'pending';

  update public.visual_dna_option_sets
  set status = 'failed', status_reason = p_reason, finished_at = now()
  where id = p_option_set_id
  returning * into v_set;

  if v_set.credit_cost > 0 and v_set.credit_ledger_id is not null
     and not exists (
       select 1 from public.credit_ledger
       where reference_type = 'visual_dna_option_sets' and reference_id = v_set.id and operation = 'visual_dna_generation_refund'
     )
  then
    select * into v_account from public.credit_accounts where workspace_id = v_set.workspace_id for update;
    if v_account.id is not null then
      v_new_balance := v_account.balance + v_set.credit_cost;
      update public.credit_accounts set balance = v_new_balance where id = v_account.id;
      insert into public.credit_ledger (workspace_id, account_id, amount, balance_after, operation, reference_type, reference_id, created_by, metadata)
      values (v_set.workspace_id, v_account.id, v_set.credit_cost, v_new_balance, 'visual_dna_generation_refund', 'visual_dna_option_sets', v_set.id, null, jsonb_build_object('original_ledger_id', v_set.credit_ledger_id, 'system', true, 'reason', p_reason));
    end if;
  end if;

  perform public.log_audit_event(v_set.workspace_id, 'visual_dna_generation_failed', 'visual_dna_option_sets', v_set.id, jsonb_build_object('reason', p_reason));

  return v_set;
end;
$function$;

revoke all on function public.fail_visual_dna_generation(uuid, text) from public, anon;
grant execute on function public.fail_visual_dna_generation(uuid, text) to authenticated, service_role;
