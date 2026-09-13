-- CAIXA (recebido) / COBRANÇA (emitido) / A receber / Inadimplente do
-- período — sempre de billing_charges quando existir dado real; projeção
-- só entra pra períodos futuros sem cobrança emitida ainda, e vem
-- claramente separada (nunca somada ao "emitido").
create or replace function public.admin_financial_summary_system(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_issued_cents bigint;
  v_received_cents bigint;
  v_receivable_cents bigint;
  v_overdue_cents bigint;
  v_projected_cents bigint;
  v_has_issued boolean;
begin
  perform public._require_platform_admin();

  select coalesce(sum(final_amount_cents), 0), count(*) > 0
    into v_issued_cents, v_has_issued
    from public.billing_charges
    where due_date between p_period_start and p_period_end;

  select coalesce(sum(final_amount_cents), 0) into v_received_cents
    from public.billing_charges
    where status = 'paid' and paid_at::date between p_period_start and p_period_end;

  select coalesce(sum(final_amount_cents), 0) into v_receivable_cents
    from public.billing_charges
    where status = 'pending' and due_date between p_period_start and p_period_end;

  select coalesce(sum(final_amount_cents), 0) into v_overdue_cents
    from public.billing_charges
    where status = 'overdue' and due_date between p_period_start and p_period_end;

  select coalesce(sum(amount_cents), 0) into v_projected_cents
    from public._admin_projected_charges(p_period_start, p_period_end);

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'issued_cents', v_issued_cents,
    'has_issued_data', v_has_issued,
    'received_cents', v_received_cents,
    'receivable_cents', v_receivable_cents,
    'overdue_cents', v_overdue_cents,
    'projected_cents', v_projected_cents
  );
end;
$$;
revoke execute on function public.admin_financial_summary_system(date, date) from public;
grant execute on function public.admin_financial_summary_system(date, date) to authenticated;

-- MRR/ARR/clientes pagantes/ticket médio — ao vivo, nunca armazenado.
-- Nunca conta trial; nunca conta cancelado/expirado.
create or replace function public.admin_recurring_revenue_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mrr_cents bigint := 0;
  v_paying_customers int := 0;
  r record;
begin
  perform public._require_platform_admin();

  for r in
    select s.organization_id, s.plan_id, s.billing_interval
    from public.subscriptions s
    where public.get_effective_subscription_status(s) in ('active', 'past_due')
  loop
    v_mrr_cents := v_mrr_cents + public._admin_org_mrr_cents(r.plan_id, r.billing_interval, r.organization_id);
    v_paying_customers := v_paying_customers + 1;
  end loop;

  return jsonb_build_object(
    'mrr_cents', v_mrr_cents,
    'arr_cents', v_mrr_cents * 12,
    'paying_customers', v_paying_customers,
    'average_ticket_cents', case when v_paying_customers > 0 then round(v_mrr_cents::numeric / v_paying_customers) else 0 end
  );
end;
$$;
revoke execute on function public.admin_recurring_revenue_system() from public;
grant execute on function public.admin_recurring_revenue_system() to authenticated;
