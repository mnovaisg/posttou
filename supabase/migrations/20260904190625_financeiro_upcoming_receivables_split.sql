-- Bloco Financeiro (item 10): separa "cobrança já emitida no Asaas"
-- (real, de billing_charges pendente/vencida) de "renovação futura
-- projetada" (calculada a partir de subscriptions, ainda sem cobrança
-- criada). NOT EXISTS evita contar duas vezes o mesmo ciclo quando a
-- Asaas já emitiu a próxima fatura antes do vencimento atual (comum:
-- Asaas costuma gerar a cobrança alguns dias antes do due_date real).
create or replace function public.admin_upcoming_receivables_system(p_days integer default 60)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_end date := current_date + make_interval(days => p_days);
begin
  perform public._require_platform_admin();

  return (
    with issued as (
      select bc.due_date, bc.final_amount_cents, bc.status, o.name as organization_name, o.id as organization_id,
             bc.plan_id, pl.name as plan_name
      from public.billing_charges bc
      join public.organizations o on o.id = bc.organization_id
      left join public.plans pl on pl.id = bc.plan_id
      where bc.status in ('pending', 'overdue') and bc.due_date <= v_end
    ),
    by_month as (
      select date_trunc('month', due_date)::date as m, sum(final_amount_cents) as cents
      from issued group by 1
    ),
    upcoming_subs as (
      select s.organization_id, s.plan_id, s.billing_interval, s.current_period_end,
             s.pending_change_kind, s.pending_plan_id, s.pending_billing_interval, s.pending_change_price_cents
      from public.subscriptions s
      where s.status in ('active', 'past_due') and s.cancel_at_period_end = false
        and s.current_period_end is not null and s.current_period_end::date <= v_end
    ),
    projected as (
      select
        us.organization_id, o.name as organization_name,
        us.current_period_end::date as due_date,
        case when us.pending_change_kind in ('cycle_change', 'downgrade')
          then us.pending_change_price_cents
          else public._admin_org_contracted_cents(us.plan_id, us.billing_interval, us.organization_id)
        end as amount_cents,
        case when us.pending_change_kind in ('cycle_change', 'downgrade') then us.pending_plan_id else us.plan_id end as plan_id,
        coalesce(plnew.name, plcur.name) as plan_name
      from upcoming_subs us
      join public.organizations o on o.id = us.organization_id
      left join public.plans plcur on plcur.id = us.plan_id
      left join public.plans plnew on plnew.id = us.pending_plan_id
      where not exists (
        select 1 from public.billing_charges bc
        where bc.organization_id = us.organization_id
          and bc.status in ('pending', 'overdue')
          and bc.due_date between us.current_period_end::date - 3 and us.current_period_end::date + 3
      )
    )
    select jsonb_build_object(
      'issued', coalesce((select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id, 'organization_name', organization_name,
        'due_date', due_date, 'amount_cents', final_amount_cents, 'status', status,
        'plan_id', plan_id, 'plan_name', plan_name
      ) order by due_date) from issued), '[]'::jsonb),
      'projected', coalesce((select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id, 'organization_name', organization_name,
        'due_date', due_date, 'amount_cents', amount_cents, 'plan_id', plan_id, 'plan_name', plan_name
      ) order by due_date) from projected), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'cents', cents) order by m) from by_month), '[]'::jsonb)
    )
  );
end;
$function$;
