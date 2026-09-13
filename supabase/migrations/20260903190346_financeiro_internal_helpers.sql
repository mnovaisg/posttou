-- Valor real cobrado por ciclo (nunca normalizado) — usado em
-- projeção/cobranças. Se existir cupom recorrente aplicado, é o valor
-- real da recorrência no Asaas; senão é o preço de tabela do plano.
create or replace function public._admin_org_cycle_charge_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select cr.final_amount_cents from public.coupon_redemptions cr join public.coupons c on c.id = cr.coupon_id
     where cr.organization_id = p_organization_id and cr.status = 'applied' and c.duration = 'recurring'
     order by cr.created_at desc limit 1),
    (select case when p_interval = 'monthly' then pl.price_monthly_cents else pl.price_yearly_cents end
     from public.plans pl where pl.id = p_plan_id)
  );
$$;
revoke execute on function public._admin_org_cycle_charge_cents(text, billing_interval, uuid) from public;

-- MRR normalizado (anual / 12) — só para a métrica MRR/ARR, nunca para caixa/projeção de cobrança individual.
create or replace function public._admin_org_mrr_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select case when p_interval = 'monthly'
    then public._admin_org_cycle_charge_cents(p_plan_id, p_interval, p_organization_id)
    else round(public._admin_org_cycle_charge_cents(p_plan_id, p_interval, p_organization_id) / 12.0)
  end;
$$;
revoke execute on function public._admin_org_mrr_cents(text, billing_interval, uuid) from public;

-- Simula as cobranças futuras esperadas de cada assinatura viva, dentro
-- do intervalo pedido. Nunca projeta org com cancel_at_period_end=true
-- (já não vai gerar nova cobrança nenhuma) nem status fora de
-- active/past_due. Cíclo mensal gera 1 linha por mês; anual só no mês
-- da renovação (current_period_end), nunca fracionado.
create or replace function public._admin_projected_charges(p_start date, p_end date)
returns table(charge_month date, organization_id uuid, amount_cents bigint)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  r record;
  v_next date;
  v_amount bigint;
begin
  for r in
    select s.organization_id, s.plan_id, s.billing_interval, s.current_period_end
    from public.subscriptions s
    where s.status in ('active', 'past_due') and s.cancel_at_period_end = false
  loop
    v_amount := public._admin_org_cycle_charge_cents(r.plan_id, r.billing_interval, r.organization_id);
    v_next := coalesce(r.current_period_end::date, current_date);

    if r.billing_interval = 'monthly' then
      while v_next <= p_end loop
        if v_next >= p_start then
          charge_month := date_trunc('month', v_next)::date;
          organization_id := r.organization_id;
          amount_cents := v_amount;
          return next;
        end if;
        v_next := (v_next + interval '1 month')::date;
      end loop;
    else
      if v_next between p_start and p_end then
        charge_month := date_trunc('month', v_next)::date;
        organization_id := r.organization_id;
        amount_cents := v_amount;
        return next;
      end if;
    end if;
  end loop;
end;
$$;
revoke execute on function public._admin_projected_charges(date, date) from public;
