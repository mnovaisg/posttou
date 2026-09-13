-- Bloco: Upgrade por pró-rata + sincronização da recorrência Asaas.
-- pending_change_price_cents passa a significar SEMPRE "o que está sendo
-- cobrado agora" (pró-rata quando aplicável, preço cheio nos casos ainda
-- não cobertos: trial, mudança de ciclo). pending_change_new_recurring_cents
-- é o valor que deve valer na PRÓXIMA recorrência Asaas — só é
-- preenchido quando o novo motor (mesmo ciclo, status active) decide o
-- valor; fica NULL nos casos não cobertos, e nesse caso a sincronização
-- com a Asaas é pulada de propósito (comportamento antigo preservado).
alter table public.subscriptions add column if not exists pending_change_new_recurring_cents integer;
alter table public.subscriptions add column if not exists asaas_sync_status text not null default 'synced'
  check (asaas_sync_status in ('synced', 'pending', 'failed'));
alter table public.subscriptions add column if not exists asaas_sync_target_price_cents integer;
alter table public.subscriptions add column if not exists asaas_sync_last_error text;
alter table public.subscriptions add column if not exists asaas_sync_attempted_at timestamptz;

comment on column public.subscriptions.asaas_sync_status is 'synced = recorrência Asaas coerente com plan_id/billing_interval atuais. pending = aguardando o PUT de sincronização (webhook acabou de aplicar um upgrade). failed = o PUT falhou, asaas_sync_target_price_cents guarda o valor que ainda precisa ser sincronizado, retry manual disponível no Admin.';

-- Fix: esta função já dizia respeitar "cupom recorrente aplicável à
-- assinatura", mas nunca filtrava por plan_id/billing_interval — podia
-- devolver o final_amount_cents de um cupom aplicado a um plano ANTERIOR
-- (antes de um upgrade/downgrade), atribuindo por engano o valor
-- descontado do plano antigo ao plano novo. coupon_redemptions já tem
-- plan_id/billing_interval; filtrar por eles corrige tanto o uso
-- existente (Financeiro) quanto o novo uso (pró-rata de upgrade).
create or replace function public._admin_org_cycle_charge_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select cr.final_amount_cents from public.coupon_redemptions cr join public.coupons c on c.id = cr.coupon_id
     where cr.organization_id = p_organization_id and cr.status = 'applied' and c.duration = 'recurring'
       and cr.plan_id = p_plan_id and cr.billing_interval = p_interval
     order by cr.created_at desc limit 1),
    (select case when p_interval = 'monthly' then pl.price_monthly_cents else pl.price_yearly_cents end
     from public.plans pl where pl.id = p_plan_id)
  );
$$;
