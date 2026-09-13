-- Descontos concedidos no período, separando 1ª cobrança de recorrente
-- (nunca soma os dois conceitos juntos).
create or replace function public.admin_discounts_summary_system(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public._require_platform_admin();

  return (
    select jsonb_build_object(
      'gross_cents', coalesce(sum(cr.original_amount_cents), 0),
      'discount_cents', coalesce(sum(cr.discount_amount_cents), 0),
      'net_cents', coalesce(sum(cr.final_amount_cents), 0),
      'discount_first_payment_cents', coalesce(sum(cr.discount_amount_cents) filter (where c.duration = 'first_payment'), 0),
      'discount_recurring_cents', coalesce(sum(cr.discount_amount_cents) filter (where c.duration = 'recurring'), 0)
    )
    from public.coupon_redemptions cr
    join public.coupons c on c.id = cr.coupon_id
    where cr.status = 'applied' and cr.created_at::date between p_period_start and p_period_end
  );
end;
$$;
revoke execute on function public.admin_discounts_summary_system(date, date) from public;
grant execute on function public.admin_discounts_summary_system(date, date) to authenticated;

-- Próximos recebimentos previstos (cobranças reais já emitidas, pendentes
-- ou vencidas — nunca projeção) + agrupamento por mês.
create or replace function public.admin_upcoming_receivables_system(p_days integer default 60)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public._require_platform_admin();

  return (
    with items as (
      select bc.due_date, bc.final_amount_cents, bc.status, o.name as organization_name, o.id as organization_id
      from public.billing_charges bc
      join public.organizations o on o.id = bc.organization_id
      where bc.status in ('pending', 'overdue') and bc.due_date <= current_date + make_interval(days => p_days)
      order by bc.due_date asc
    ),
    by_month as (
      select date_trunc('month', due_date)::date as m, sum(final_amount_cents) as cents
      from items group by 1
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id, 'organization_name', organization_name,
        'due_date', due_date, 'amount_cents', final_amount_cents, 'status', status
      )) from items), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'cents', cents) order by m) from by_month), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.admin_upcoming_receivables_system(integer) from public;
grant execute on function public.admin_upcoming_receivables_system(integer) to authenticated;

-- Receita perdida — sempre métrica derivada, nunca movimentação de caixa.
-- Cancelado: MRR (na configuração atual) de orgs com cancelamento
-- voluntário registrado dentro do período. Em risco: MRR atual de quem
-- está past_due agora (foto do presente, não tem período).
create or replace function public.admin_revenue_lost_system(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cancelled_cents bigint := 0;
  v_at_risk_cents bigint := 0;
  r record;
begin
  perform public._require_platform_admin();

  for r in
    select distinct h.organization_id, s.plan_id, s.billing_interval
    from public.subscription_status_history h
    join public.subscriptions s on s.organization_id = h.organization_id
    where h.reason = 'user_requested' and h.created_at::date between p_period_start and p_period_end
  loop
    v_cancelled_cents := v_cancelled_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
  end loop;

  for r in
    select s.plan_id, s.billing_interval, s.organization_id
    from public.subscriptions s
    where public.get_effective_subscription_status(s) = 'past_due'
  loop
    v_at_risk_cents := v_at_risk_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
  end loop;

  return jsonb_build_object(
    'mrr_cancelled_in_period_cents', v_cancelled_cents,
    'mrr_at_risk_past_due_cents', v_at_risk_cents,
    'note', 'Métricas derivadas do MRR normalizado das assinaturas — não representam movimentação de caixa.'
  );
end;
$$;
revoke execute on function public.admin_revenue_lost_system(date, date) from public;
grant execute on function public.admin_revenue_lost_system(date, date) to authenticated;
