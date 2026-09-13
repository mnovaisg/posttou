-- Bloco Financeiro (ajuste 13): "para recorrência atual, usar o valor
-- efetivamente contratado quando disponível" — clientes legados podem
-- ter um valor real na Asaas diferente do preço vigente em `plans`
-- (porque o preço mudou depois que eles assinaram, via Admin Planos &
-- Preços). Este helper é usado SÓ pelo Financeiro (MRR/ARR/projeção) —
-- nunca pelo motor de precificação de upgrade/troca de ciclo
-- (request_plan_change continua usando _admin_org_cycle_charge_cents
-- direto, que representa "preço vigente", exatamente como já aprovado).
--
-- Prioridade: (1) última cobrança PAGA em billing_charges pro mesmo
-- plan_id/billing_interval do cliente hoje — evidência real do que ele
-- de fato paga; (2) se nunca houve cobrança nesse plano/ciclo (ex.:
-- trial nunca convertido, ou acabou de trocar de plano e ainda não
-- foi cobrado), cai no preço vigente (com cupom recorrente, se houver)
-- via _admin_org_cycle_charge_cents — melhor estimativa disponível,
-- nunca inventada.
create or replace function public._admin_org_contracted_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select bc.final_amount_cents from public.billing_charges bc
     where bc.organization_id = p_organization_id and bc.plan_id = p_plan_id and bc.billing_interval = p_interval
       and bc.status = 'paid'
     order by coalesce(bc.paid_at, bc.due_date) desc limit 1),
    public._admin_org_cycle_charge_cents(p_plan_id, p_interval, p_organization_id)
  );
$$;

-- MRR/ARR e "Receita por plano" agora refletem o valor real contratado
-- quando existe evidência (billing_charges pago), não só o preço
-- vigente de `plans`. admin_revenue_lost_system (MRR cancelado/em
-- risco) se beneficia automaticamente por já usar esta função.
create or replace function public._admin_org_mrr_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select case when p_interval = 'monthly'
    then public._admin_org_contracted_cents(p_plan_id, p_interval, p_organization_id)
    else round(public._admin_org_contracted_cents(p_plan_id, p_interval, p_organization_id) / 12.0)
  end;
$$;
