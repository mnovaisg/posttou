-- Bloco Financeiro (ajuste 13 + item 7 do bloco): a projeção agora
-- respeita mudança de ciclo/plano JÁ AGENDADA (pending_change_kind in
-- ('cycle_change','downgrade')) — antes do vencimento atual, projeta
-- com o valor REAL contratado hoje; a partir do vencimento (quando a
-- troca é efetivada de verdade, mesmo motor do bloco anterior), passa
-- a projetar com o plano/ciclo/preço NOVO já congelado em
-- pending_change_price_cents — nunca recalculado, é exatamente o valor
-- que o cliente já viu e confirmou. Cancelamento agendado continua
-- excluído (cancel_at_period_end = false). Upgrade pendente (aguardando
-- confirmação de pagamento) não muda a projeção — resolve sozinho no
-- ciclo atual. Mensal e anual num único loop (anual sempre aparece
-- como cobrança integral no mês esperado, nunca dividido por 12 — só
-- o MRR normaliza, a projeção de caixa não).
create or replace function public._admin_projected_charges(p_start date, p_end date)
returns table(charge_month date, organization_id uuid, amount_cents bigint)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  r record;
  v_plan_id text;
  v_interval billing_interval;
  v_amount bigint;
  v_next date;
  v_switch_done boolean;
  v_switch_date date;
begin
  for r in
    select s.organization_id, s.plan_id, s.billing_interval, s.current_period_end,
           s.pending_change_kind, s.pending_plan_id, s.pending_billing_interval, s.pending_change_price_cents
    from public.subscriptions s
    where s.status in ('active', 'past_due') and s.cancel_at_period_end = false
  loop
    v_plan_id := r.plan_id;
    v_interval := r.billing_interval;
    v_amount := public._admin_org_contracted_cents(v_plan_id, v_interval, r.organization_id);
    v_next := coalesce(r.current_period_end::date, current_date);
    v_switch_date := r.current_period_end::date;
    v_switch_done := coalesce(r.pending_change_kind, '') not in ('cycle_change', 'downgrade');

    while v_next <= p_end loop
      if not v_switch_done and v_next >= v_switch_date then
        v_plan_id := r.pending_plan_id;
        v_interval := r.pending_billing_interval;
        v_amount := r.pending_change_price_cents;
        v_switch_done := true;
      end if;

      if v_next >= p_start then
        charge_month := date_trunc('month', v_next)::date;
        organization_id := r.organization_id;
        amount_cents := v_amount;
        return next;
      end if;

      if v_interval = 'monthly' then
        v_next := (v_next + interval '1 month')::date;
      else
        v_next := (v_next + interval '1 year')::date;
      end if;
    end loop;
  end loop;
end;
$function$;
