-- Fase 12 — correção de integridade de crédito: as 3 imagens de uma rodada
-- (visual_dna_options) NUNCA carregam o credit_ledger_id do option_set —
-- se carregassem, refund_ai_generation_system (que estorna o VALOR TOTAL do
-- ledger apontado, keyed só por generation_id) estornaria os 45 créditos
-- inteiros a cada imagem que falhasse, e duas falhas estornariam 90 créditos
-- de uma cobrança de 45 (bug de duplicidade). Por isso cada ai_generations
-- de opção usa credit_ledger_id = null (custo real só informativo) e todo
-- estorno de rodada acontece aqui, uma única vez, só quando as 3 falham.
create or replace function public.sync_visual_dna_option_set(p_option_set_id uuid)
returns public.visual_dna_option_sets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_set public.visual_dna_option_sets;
  v_opt record;
  v_gen record;
  v_all_done boolean := true;
  v_any_success boolean := false;
  v_account public.credit_accounts;
  v_new_balance bigint;
begin
  select * into v_set from public.visual_dna_option_sets where id = p_option_set_id;
  if v_set.id is null then
    raise exception 'Rodada não encontrada.';
  end if;
  if auth.uid() is not null and not public.is_workspace_member(v_set.workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;
  if v_set.status <> 'generating' then
    return v_set;
  end if;

  for v_opt in select * from public.visual_dna_options where option_set_id = p_option_set_id loop
    if v_opt.status = 'pending' and v_opt.ai_generation_id is not null then
      select * into v_gen from public.ai_generations where id = v_opt.ai_generation_id;
      if v_gen.status = 'success' then
        update public.visual_dna_options
        set status = 'generated', preview_asset_path = v_gen.result_asset_paths[1]
        where id = v_opt.id;
        v_any_success := true;
      elsif v_gen.status = 'failed' then
        update public.visual_dna_options set status = 'failed' where id = v_opt.id;
      else
        v_all_done := false;
      end if;
    elsif v_opt.status = 'pending' then
      v_all_done := false;
    end if;
  end loop;

  if v_all_done then
    update public.visual_dna_option_sets
    set status = case when v_any_success then 'ready' else 'failed' end, finished_at = now()
    where id = p_option_set_id
    returning * into v_set;

    -- Estorno único e idempotente: só quando a rodada foi paga, falhou por
    -- completo (nenhuma das 3 gerou), e ainda não houve estorno pra este
    -- option_set (idempotência por reference_id = option_set.id).
    if not v_any_success and v_set.credit_cost > 0 and v_set.credit_ledger_id is not null
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
        values (v_set.workspace_id, v_account.id, v_set.credit_cost, v_new_balance, 'visual_dna_generation_refund', 'visual_dna_option_sets', v_set.id, null, jsonb_build_object('original_ledger_id', v_set.credit_ledger_id, 'system', true));
      end if;
    end if;
  end if;

  return v_set;
end;
$function$;

revoke all on function public.sync_visual_dna_option_set(uuid) from public, anon;
grant execute on function public.sync_visual_dna_option_set(uuid) to authenticated, service_role;
