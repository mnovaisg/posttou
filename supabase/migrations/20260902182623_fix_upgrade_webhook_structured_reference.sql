
-- Bloco 11.1-B: causa raiz do bug de upgrade — a cobrança avulsa criada em
-- billing-change-plan é um objeto `payments` do Asaas SEM `subscription`
-- (não é um ciclo de uma subscription recorrente), então o webhook nunca
-- conseguia rotear o evento pra process_asaas_payment_confirmed_system
-- (que só sabe procurar por asaas_subscription_id). Corrigido dando à
-- subscription do POSTTOU uma referência estruturada e segura pro
-- id EXATO dessa cobrança avulsa (nunca texto de descrição) — o webhook
-- passa a conseguir reconhecer "isto é o pagamento de upgrade pendente
-- desta organização" mesmo sem `payment.subscription`.
alter table public.subscriptions add column if not exists pending_change_payment_id text;
comment on column public.subscriptions.pending_change_payment_id is 'id da cobrança avulsa (Asaas payments) criada pelo upgrade pendente — referência estruturada usada pelo webhook para identificar e confirmar o upgrade, nunca a descrição textual da cobrança.';

-- Chamada pela Edge Function logo depois que o Asaas confirma a criação
-- da cobrança avulsa de upgrade — grava a referência estruturada.
create or replace function public.record_pending_upgrade_payment_system(
  p_organization_id uuid,
  p_asaas_payment_id text
) returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
begin
  update public.subscriptions
  set pending_change_payment_id = p_asaas_payment_id, updated_at = now()
  where organization_id = p_organization_id and pending_change_kind = 'upgrade'
  returning * into v_sub;
  if v_sub is null then
    raise exception 'NO_PENDING_UPGRADE_FOUND';
  end if;
  return v_sub;
end;
$function$;
revoke all on function public.record_pending_upgrade_payment_system(uuid, text) from public, authenticated, anon;
grant execute on function public.record_pending_upgrade_payment_system(uuid, text) to service_role;

-- Confirmação do pagamento avulso de upgrade — mesma disciplina de
-- idempotência (insert-first-catch-unique-violation em
-- asaas_webhook_events) e trava de linha (for update) do caminho
-- recorrente já existente. Só aplica o upgrade se a referência bater
-- EXATAMENTE (organização certa, pending_change_kind='upgrade' e o
-- payment id exatamente igual ao que foi gravado na criação da
-- cobrança) — nunca por inferência de texto.
create or replace function public.process_asaas_upgrade_payment_confirmed_system(
  p_asaas_payment_id text,
  p_organization_id uuid,
  p_asaas_event_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
begin
  begin
    insert into public.asaas_webhook_events (asaas_event_id, event_type, payload)
    values (p_asaas_event_id, 'PAYMENT_CONFIRMED_UPGRADE', jsonb_build_object('asaas_payment_id', p_asaas_payment_id, 'organization_id', p_organization_id));
  exception when unique_violation then
    return jsonb_build_object('status', 'already_processed');
  end;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;

  -- Referência tem que bater exatamente — se a organização mudou de
  -- ideia (nova solicitação sobrescreveu pending_change_payment_id) ou
  -- já não há upgrade pendente algum, isto é um evento tardio/obsoleto:
  -- reconhece sem aplicar nada (nunca aplica upgrade errado).
  if v_sub.pending_change_kind is distinct from 'upgrade' or v_sub.pending_change_payment_id is distinct from p_asaas_payment_id then
    return jsonb_build_object('status', 'stale_or_mismatched_reference');
  end if;

  perform public.apply_confirmed_plan_change_system(p_organization_id);

  update public.subscriptions set pending_change_payment_id = null, updated_at = now() where organization_id = p_organization_id;

  return jsonb_build_object('status', 'processed', 'organization_id', p_organization_id);
end;
$function$;
revoke all on function public.process_asaas_upgrade_payment_confirmed_system(text, uuid, text) from public, authenticated, anon;
grant execute on function public.process_asaas_upgrade_payment_confirmed_system(text, uuid, text) to service_role;

-- Cobrança de upgrade vencida/cancelada: libera a organização do estado
-- pendente (nunca deixa "meio caminho") sem tocar no plano atual, que
-- nunca havia mudado até aqui.
create or replace function public.release_stale_upgrade_system(
  p_asaas_payment_id text,
  p_organization_id uuid,
  p_asaas_event_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
begin
  begin
    insert into public.asaas_webhook_events (asaas_event_id, event_type, payload)
    values (p_asaas_event_id, 'PAYMENT_OVERDUE_UPGRADE', jsonb_build_object('asaas_payment_id', p_asaas_payment_id, 'organization_id', p_organization_id));
  exception when unique_violation then
    return jsonb_build_object('status', 'already_processed');
  end;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null or v_sub.pending_change_payment_id is distinct from p_asaas_payment_id then
    return jsonb_build_object('status', 'stale_or_mismatched_reference');
  end if;

  update public.subscriptions
  set pending_plan_id = null, pending_billing_interval = null, pending_change_kind = null,
      pending_change_price_cents = null, pending_change_payment_id = null, updated_at = now()
  where organization_id = p_organization_id;

  return jsonb_build_object('status', 'released', 'organization_id', p_organization_id);
end;
$function$;
revoke all on function public.release_stale_upgrade_system(text, uuid, text) from public, authenticated, anon;
grant execute on function public.release_stale_upgrade_system(text, uuid, text) to service_role;
