-- Fase 9 — Piloto Automático: extensões de sistema (worker sem auth.uid()).
-- Mesmo princípio já usado nas Fases 7/8: marcador local de transação
-- (posttou.system_actor) setado só dentro de RPCs específicas, nunca por
-- UPDATE direto. pilot_worker só pode: (a) consumir créditos via a
-- função-system dedicada abaixo (nunca a consume_credits normal, que
-- exige has_workspace_role/auth.uid()), e (b) mover contents de
-- rascunho para em_revisao — nenhuma outra transição, nunca aprova,
-- agenda ou publica sozinho (item 4/99 da missão).

-- ── consume_credits_system: mesmo padrão de refund_ai_generation_system,
-- que já existe neste projeto (função "system" irmã de uma função
-- checada por role, sem duplicar a lógica de débito/lock). ──
create or replace function public.consume_credits_system(
  p_workspace_id uuid,
  p_amount bigint,
  p_operation text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_ledger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account public.credit_accounts;
  v_new_balance bigint;
  v_ledger public.credit_ledger;
begin
  if p_amount <= 0 then
    raise exception 'p_amount deve ser positivo (quantidade a consumir).';
  end if;

  select * into v_account from public.credit_accounts where workspace_id = p_workspace_id for update;
  if not found then
    raise exception 'Workspace % não possui conta de créditos.', p_workspace_id;
  end if;

  if v_account.balance < p_amount then
    raise exception 'Saldo de créditos insuficiente.';
  end if;

  v_new_balance := v_account.balance - p_amount;

  update public.credit_accounts set balance = v_new_balance where id = v_account.id;

  insert into public.credit_ledger (
    workspace_id, account_id, amount, balance_after, operation, reference_type, reference_id, created_by, metadata
  ) values (
    p_workspace_id, v_account.id, -p_amount, v_new_balance, p_operation, p_reference_type, p_reference_id, null,
    p_metadata || jsonb_build_object('system', true)
  )
  returning * into v_ledger;

  return v_ledger;
end;
$function$;

comment on function public.consume_credits_system(uuid, bigint, text, text, uuid, jsonb) is 'Variante de consume_credits sem checagem de has_workspace_role/auth.uid() — só para workers de sistema (pilot_worker). Mesmo lock/validação de saldo da versão normal.';

revoke all on function public.consume_credits_system(uuid, bigint, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.consume_credits_system(uuid, bigint, text, text, uuid, jsonb) to service_role;

-- ── log_audit_event: adiciona 'pilot_worker' ao actor de sistema já aceito ──
create or replace function public.log_audit_event(p_workspace_id uuid, p_action text, p_resource_type text, p_resource_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns public.audit_logs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log public.audit_logs;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if v_system_actor in ('instagram_publish_worker', 'radar_worker', 'pilot_worker') then
    insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
    values (p_workspace_id, null, p_action, p_resource_type, p_resource_id, p_metadata || jsonb_build_object('actor', v_system_actor))
    returning * into v_log;
    return v_log;
  end if;

  if p_workspace_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem permissão para registrar auditoria neste workspace.';
  end if;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (p_workspace_id, auth.uid(), p_action, p_resource_type, p_resource_id, p_metadata)
  returning * into v_log;

  return v_log;
end;
$function$;

-- ── enforce_content_status_transition: pilot_worker só pode rascunho->em_revisao ──
create or replace function public.enforce_content_status_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  allowed boolean := false;
  v_system_actor text := current_setting('posttou.system_actor', true);
begin
  if old.deleted_at is not null then
    raise exception 'Conteúdo excluído não pode ser alterado.';
  end if;

  if new.status = old.status then
    if v_system_actor in ('instagram_publish_worker', 'pilot_worker') then
      return new;
    end if;
    if not public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]) then
      raise exception 'Sem permissão para editar este conteúdo.';
    end if;
    return new;
  end if;

  if v_system_actor = 'instagram_publish_worker' then
    allowed := (old.status = 'agendado' and new.status = 'publicando')
      or (old.status = 'publicando' and new.status in ('publicado', 'falhou'));
    if not allowed then
      raise exception 'Transição de status inválida para o worker de publicação: % -> %', old.status, new.status;
    end if;
    return new;
  end if;

  if v_system_actor = 'pilot_worker' then
    allowed := (old.status = 'rascunho' and new.status = 'em_revisao');
    if not allowed then
      raise exception 'Transição de status inválida para o worker do Piloto: % -> % (pilot_worker só pode rascunho->em_revisao, nunca aprova/agenda/publica)', old.status, new.status;
    end if;
    return new;
  end if;

  allowed := case
    when old.status = 'rascunho' and new.status = 'em_revisao' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'aprovado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'rejeitado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[])
    when old.status = 'em_revisao' and new.status = 'rascunho' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor', 'approver']::public.workspace_role[])
    when old.status = 'rejeitado' and new.status in ('rascunho', 'em_revisao') then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'aprovado' and new.status = 'agendado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
      and new.scheduled_at is not null
    when old.status = 'aprovado' and new.status = 'rascunho' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin']::public.workspace_role[])
    when old.status = 'agendado' and new.status = 'aprovado' then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    when old.status = 'falhou' and new.status in ('agendado', 'rascunho') then
      public.has_workspace_role(new.workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[])
    else false
  end;

  if not allowed then
    raise exception 'Transição de status inválida: % -> % (papel insuficiente ou transição incoerente)', old.status, new.status;
  end if;

  if new.status = 'rejeitado' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'É necessário informar um motivo para rejeitar o conteúdo.';
  end if;

  if new.status <> 'rejeitado' then
    new.rejection_reason := null;
  end if;

  if old.status = 'agendado' and new.status = 'aprovado' then
    new.scheduled_at := null;
  end if;

  return new;
end;
$function$;

comment on function public.enforce_content_status_transition() is 'Fase 3: máquina de estados de contents.status por papel. Fase 7: worker de publicação. Fase 9: pilot_worker só pode rascunho->em_revisao (marcador posttou.system_actor setado só dentro de claim_pilot_plan_items_for_generation/complete_pilot_plan_item) — nunca aprova, agenda ou publica sozinho, preservando aprovação humana obrigatória no nível do trigger, não só da aplicação.';
