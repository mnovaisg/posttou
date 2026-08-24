-- Estorno de sistema para gerações assíncronas (imagem via webhook): o
-- webhook não roda no contexto de um usuário autenticado (é a Kie.ai
-- chamando, autenticada por HMAC, não por JWT), então refund_failed_ai_generation
-- (que exige is_workspace_member do CHAMADOR) não se aplica aqui. A
-- autorização deste caminho é a verificação de assinatura HMAC feita antes,
-- no Edge Function — por isso o EXECUTE fica restrito a service_role.
create or replace function refund_ai_generation_system(p_generation_id uuid)
returns credit_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generation ai_generations;
  v_debit credit_ledger;
  v_account credit_accounts;
  v_new_balance bigint;
  v_refund credit_ledger;
begin
  select * into v_generation from ai_generations where id = p_generation_id;
  if v_generation is null then
    raise exception 'Geração não encontrada.';
  end if;
  if v_generation.status <> 'failed' then
    raise exception 'Só é possível estornar gerações com status failed.';
  end if;
  if v_generation.credit_ledger_id is null then
    raise exception 'Geração não possui débito registrado para estornar.';
  end if;

  select * into v_debit from credit_ledger where id = v_generation.credit_ledger_id;
  if v_debit is null then
    raise exception 'Débito original não encontrado.';
  end if;

  if exists (
    select 1 from credit_ledger
    where reference_type = 'ai_generations' and reference_id = p_generation_id and operation = 'ai_generation_refund'
  ) then
    select * into v_refund from credit_ledger
      where reference_type = 'ai_generations' and reference_id = p_generation_id and operation = 'ai_generation_refund'
      limit 1;
    return v_refund;
  end if;

  select * into v_account from credit_accounts where id = v_debit.account_id for update;
  v_new_balance := v_account.balance + (-v_debit.amount);

  update credit_accounts set balance = v_new_balance where id = v_account.id;

  insert into credit_ledger (
    workspace_id, account_id, amount, balance_after,
    operation, reference_type, reference_id, created_by, metadata
  ) values (
    v_generation.workspace_id, v_account.id, -v_debit.amount, v_new_balance,
    'ai_generation_refund', 'ai_generations', p_generation_id, null,
    jsonb_build_object('original_ledger_id', v_debit.id, 'system', true)
  )
  returning * into v_refund;

  return v_refund;
end;
$$;

revoke all on function refund_ai_generation_system(uuid) from public, anon, authenticated;
grant execute on function refund_ai_generation_system(uuid) to service_role;
