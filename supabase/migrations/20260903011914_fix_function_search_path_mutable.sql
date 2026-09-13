
-- Bloco 12.2 — item 4: elimina o warning function_search_path_mutable
-- fixando search_path explicitamente. Puramente aditivo — nenhuma dessas
-- 4 funções referenciava objetos fora de public/pg_catalog, então o
-- comportamento não muda.
create or replace function public._coupon_derived_status(p_coupon public.coupons, p_used_count bigint)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select case
    when not p_coupon.active then 'inactive'
    when p_coupon.expires_at is not null and p_coupon.expires_at < now() then 'expired'
    when p_coupon.starts_at is not null and p_coupon.starts_at > now() then 'scheduled'
    when p_coupon.max_redemptions is not null and p_used_count >= p_coupon.max_redemptions then 'limit_reached'
    else 'active'
  end;
$function$;

create or replace function public.enforce_radar_target_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_count int;
begin
  select count(*) into v_count from public.radar_targets where workspace_id = new.workspace_id and kind = new.kind;
  if v_count >= 5 then
    raise exception 'Limite de 5 itens atingido para este grupo.';
  end if;
  return new;
end;
$function$;

create or replace function public.get_effective_subscription_status(p_sub public.subscriptions)
returns public.subscription_status
language sql
stable
set search_path to 'public'
as $function$
  select case
    when p_sub.status = 'trialing' and p_sub.trial_ends_at is not null and p_sub.trial_ends_at < now()
      then 'expired'::public.subscription_status
    when p_sub.status = 'past_due' and p_sub.past_due_since is not null
      and now() > p_sub.past_due_since + make_interval(days => p_sub.past_due_grace_days)
      then 'expired'::public.subscription_status
    when p_sub.status = 'cancel_at_period_end' and p_sub.current_period_end is not null and p_sub.current_period_end < now()
      then 'cancelled'::public.subscription_status
    else p_sub.status
  end;
$function$;

create or replace function public.get_franchise_period(p_sub public.subscriptions, p_now timestamp with time zone DEFAULT now())
returns table(period_start date, period_end date)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_anchor timestamptz;
  v_months_elapsed integer;
  v_start timestamptz;
begin
  v_anchor := coalesce(p_sub.activated_at, p_sub.trial_ends_at - interval '3 days', p_sub.created_at);
  v_months_elapsed := extract(year from age(p_now, v_anchor))::integer * 12 + extract(month from age(p_now, v_anchor))::integer;
  v_start := v_anchor + make_interval(months => greatest(v_months_elapsed, 0));
  return query select v_start::date, (v_start + interval '1 month')::date;
end;
$function$;
