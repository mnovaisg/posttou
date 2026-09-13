
-- Bloco 12.2 — item 12: request_plan_change comparava só preço pra
-- decidir upgrade/downgrade, então uma troca SÓ de ciclo (ou upgrade de
-- plano combinado com troca de ciclo) numa assinatura já paga (active/
-- past_due/cancel_at_period_end) cairia no mesmo caminho de upgrade —
-- cobrando o valor integral do novo ciclo sem nenhum crédito
-- proporcional pelo período já pago no ciclo antigo (achado do Bloco
-- 12, auditado e não implementado como pró-rata improvisado por
-- instrução explícita).
--
-- Contratação inicial (billing-create-checkout, fora desta função) e
-- trocas durante o trial (sem cobrança ainda feita, sem risco de
-- pró-rata) continuam livres. Upgrade/downgrade de plano DENTRO do mesmo
-- ciclo continuam funcionando exatamente como antes.
create or replace function public.request_plan_change(p_organization_id uuid, p_new_plan_id text, p_new_billing_interval billing_interval)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
  v_current_plan public.plans;
  v_new_plan public.plans;
  v_current_price bigint;
  v_new_price bigint;
  v_kind text;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'ONLY_ORGANIZATION_OWNER_CAN_CHANGE_PLAN';
  end if;

  select * into v_sub from public.subscriptions where organization_id = p_organization_id for update;
  if v_sub is null then raise exception 'NO_SUBSCRIPTION_FOUND'; end if;

  select * into v_new_plan from public.plans where id = p_new_plan_id and is_active;
  if v_new_plan is null then raise exception 'INVALID_PLAN'; end if;

  -- Troca de ciclo (mensal<->anual) numa assinatura que já teve cobrança
  -- real ainda não tem regra financeira segura de pró-rata — bloqueada
  -- até existir uma. Durante o trial (nada cobrado ainda) não há esse
  -- risco, então segue liberado.
  if p_new_billing_interval <> v_sub.billing_interval and v_sub.status <> 'trialing' then
    raise exception 'INTERVAL_CHANGE_NOT_SUPPORTED' using hint = 'Troca de ciclo (mensal/anual) em uma assinatura já ativa ainda não é suportada de forma segura. Fale com o suporte.';
  end if;

  select * into v_current_plan from public.plans where id = v_sub.plan_id;
  v_current_price := case when v_sub.billing_interval = 'monthly' then v_current_plan.price_monthly_cents else v_current_plan.price_yearly_cents end;
  v_new_price := case when p_new_billing_interval = 'monthly' then v_new_plan.price_monthly_cents else v_new_plan.price_yearly_cents end;

  v_kind := case when v_new_price > v_current_price then 'upgrade' else 'downgrade' end;

  if v_kind = 'downgrade' then
    -- Downgrade: só entra em vigor no próximo ciclo, sem cobrança nova
    -- agora. Nunca apaga workspaces/membros/conteúdo excedente.
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'downgrade', pending_change_price_cents = v_new_price, updated_at = now()
    where organization_id = p_organization_id;
  else
    -- Upgrade: entitlements só liberam após cobrança confirmada (decisão
    -- explícita da Fase 14B — sem "libera agora, cobra depois"). O valor
    -- efetivamente cobrado é decidido pela Edge Function que fala com o
    -- Asaas; aqui só registramos a intenção.
    update public.subscriptions
    set pending_plan_id = p_new_plan_id, pending_billing_interval = p_new_billing_interval,
        pending_change_kind = 'upgrade', pending_change_price_cents = v_new_price, updated_at = now()
    where organization_id = p_organization_id;
  end if;

  return jsonb_build_object('kind', v_kind, 'new_plan_id', p_new_plan_id, 'new_price_cents', v_new_price);
end;
$function$;
