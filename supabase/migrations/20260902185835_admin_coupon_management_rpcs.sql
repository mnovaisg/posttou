
-- Bloco 11.1: RPCs de gestão de cupons para a Área Administrativa.
-- Todas checam is_platform_admin(auth.uid()) internamente — nunca confiam
-- em papel de workspace. Todas gravam em audit_logs via log_audit_event
-- (workspace_id => null, já protegido pela policy corrigida acima).

create or replace function public._require_platform_admin()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'NOT_PLATFORM_ADMIN';
  end if;
end;
$$;

-- Status derivado sempre calculado on-the-fly a partir das regras reais
-- (nunca armazenado) — evita ficar dessincronizado do estado real.
create or replace function public._coupon_derived_status(p_coupon public.coupons, p_used_count bigint)
returns text
language sql
stable
as $$
  select case
    when not p_coupon.active then 'inactive'
    when p_coupon.expires_at is not null and p_coupon.expires_at < now() then 'expired'
    when p_coupon.starts_at is not null and p_coupon.starts_at > now() then 'scheduled'
    when p_coupon.max_redemptions is not null and p_used_count >= p_coupon.max_redemptions then 'limit_reached'
    else 'active'
  end;
$$;

create or replace function public.admin_list_coupons_system(
  p_search text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform public._require_platform_admin();

  with counted as (
    select
      c.*,
      coalesce((select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved','applied')), 0) as used_count
    from public.coupons c
    where (p_search is null or p_search = '' or c.code_normalized ilike '%' || upper(p_search) || '%')
  ),
  withstatus as (
    select *, public._coupon_derived_status(counted.*::public.coupons, used_count) as derived_status
    from counted
  )
  select
    jsonb_build_object(
      'total', (select count(*) from withstatus where p_status is null or p_status = '' or derived_status = p_status),
      'items', coalesce(jsonb_agg(row_to_json(w)::jsonb order by w.created_at desc) filter (where w.rn > p_offset and w.rn <= p_offset + p_limit), '[]'::jsonb)
    )
  into v_rows
  from (
    select w.*, row_number() over (order by w.created_at desc) as rn
    from withstatus w
    where p_status is null or p_status = '' or w.derived_status = p_status
  ) w;

  return v_rows;
end;
$$;

grant execute on function public.admin_list_coupons_system(text, text, int, int) to authenticated;

create or replace function public.admin_get_coupon_detail_system(p_coupon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_coupon public.coupons;
  v_used_count bigint;
  v_redemptions jsonb;
begin
  perform public._require_platform_admin();

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if v_coupon is null then raise exception 'COUPON_NOT_FOUND'; end if;

  select count(*) into v_used_count from public.coupon_redemptions where coupon_id = p_coupon_id and status in ('reserved','applied');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'organization_id', r.organization_id,
    'organization_name', o.name,
    'status', r.status,
    'original_amount_cents', r.original_amount_cents,
    'discount_amount_cents', r.discount_amount_cents,
    'final_amount_cents', r.final_amount_cents,
    'plan_id', r.plan_id,
    'billing_interval', r.billing_interval,
    'failure_reason', r.failure_reason,
    'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_redemptions
  from public.coupon_redemptions r
  left join public.organizations o on o.id = r.organization_id
  where r.coupon_id = p_coupon_id;

  return jsonb_build_object(
    'coupon', to_jsonb(v_coupon) || jsonb_build_object('derived_status', public._coupon_derived_status(v_coupon, v_used_count), 'used_count', v_used_count),
    'redemptions', v_redemptions
  );
end;
$$;

grant execute on function public.admin_get_coupon_detail_system(uuid) to authenticated;

create or replace function public.admin_create_coupon_system(
  p_code text,
  p_discount_type public.coupon_discount_type,
  p_discount_value numeric,
  p_duration public.coupon_duration,
  p_eligible_plan_ids text[] default null,
  p_eligible_billing_intervals public.billing_interval[] default null,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_max_redemptions int default null,
  p_max_redemptions_per_organization int default 1,
  p_active boolean default true
)
returns public.coupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code_normalized text := upper(trim(p_code));
  v_coupon public.coupons;
begin
  perform public._require_platform_admin();

  if v_code_normalized is null or v_code_normalized = '' then
    raise exception 'INVALID_CODE';
  end if;
  if p_discount_type = 'percentage' and (p_discount_value <= 0 or p_discount_value > 100) then
    raise exception 'INVALID_PERCENTAGE_VALUE';
  end if;
  if p_discount_type = 'fixed' and p_discount_value <= 0 then
    raise exception 'INVALID_FIXED_VALUE';
  end if;

  insert into public.coupons (
    code, code_normalized, discount_type, discount_value, duration,
    eligible_plan_ids, eligible_billing_intervals, starts_at, expires_at,
    max_redemptions, max_redemptions_per_organization, active, created_by
  ) values (
    v_code_normalized, v_code_normalized, p_discount_type, p_discount_value, p_duration,
    p_eligible_plan_ids, p_eligible_billing_intervals, p_starts_at, p_expires_at,
    p_max_redemptions, p_max_redemptions_per_organization, p_active, auth.uid()
  )
  returning * into v_coupon;

  perform public.log_audit_event(null, 'admin_coupon_created', 'coupon', v_coupon.id, jsonb_build_object('code', v_coupon.code));

  return v_coupon;
end;
$$;

grant execute on function public.admin_create_coupon_system(text, public.coupon_discount_type, numeric, public.coupon_duration, text[], public.billing_interval[], timestamptz, timestamptz, int, int, boolean) to authenticated;

-- Edição: campos "perigosos" (mudariam o valor/elegibilidade de descontos
-- já concedidos) são bloqueados assim que o cupom tiver qualquer resgate
-- (reserved ou applied) — nunca alteramos retroativamente o que já foi
-- cobrado. Campos "seguros" (datas futuras, limites, ativo/inativo) sempre
-- editáveis.
create or replace function public.admin_update_coupon_system(
  p_coupon_id uuid,
  p_discount_type public.coupon_discount_type,
  p_discount_value numeric,
  p_duration public.coupon_duration,
  p_eligible_plan_ids text[],
  p_eligible_billing_intervals public.billing_interval[],
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_max_redemptions int,
  p_max_redemptions_per_organization int
)
returns public.coupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_coupon public.coupons;
  v_used_count bigint;
  v_dangerous_changed boolean;
begin
  perform public._require_platform_admin();

  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if v_coupon is null then raise exception 'COUPON_NOT_FOUND'; end if;

  select count(*) into v_used_count from public.coupon_redemptions where coupon_id = p_coupon_id and status in ('reserved','applied');

  v_dangerous_changed := (
    v_coupon.discount_type is distinct from p_discount_type
    or v_coupon.discount_value is distinct from p_discount_value
    or v_coupon.duration is distinct from p_duration
    or v_coupon.eligible_plan_ids is distinct from p_eligible_plan_ids
    or v_coupon.eligible_billing_intervals is distinct from p_eligible_billing_intervals
    or v_coupon.starts_at is distinct from p_starts_at
  );

  if v_used_count > 0 and v_dangerous_changed then
    raise exception 'COUPON_ALREADY_USED_CANNOT_CHANGE_TERMS' using hint = 'Crie um novo cupom em vez de alterar as regras de um cupom já utilizado.';
  end if;

  update public.coupons set
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    duration = p_duration,
    eligible_plan_ids = p_eligible_plan_ids,
    eligible_billing_intervals = p_eligible_billing_intervals,
    starts_at = p_starts_at,
    expires_at = p_expires_at,
    max_redemptions = p_max_redemptions,
    max_redemptions_per_organization = p_max_redemptions_per_organization,
    updated_at = now()
  where id = p_coupon_id
  returning * into v_coupon;

  perform public.log_audit_event(null, 'admin_coupon_updated', 'coupon', v_coupon.id, jsonb_build_object('code', v_coupon.code, 'dangerous_fields_changed', v_dangerous_changed));

  return v_coupon;
end;
$$;

grant execute on function public.admin_update_coupon_system(uuid, public.coupon_discount_type, numeric, public.coupon_duration, text[], public.billing_interval[], timestamptz, timestamptz, int, int) to authenticated;

create or replace function public.admin_set_coupon_active_system(p_coupon_id uuid, p_active boolean)
returns public.coupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_coupon public.coupons;
begin
  perform public._require_platform_admin();

  update public.coupons set active = p_active, updated_at = now()
  where id = p_coupon_id
  returning * into v_coupon;

  if v_coupon is null then raise exception 'COUPON_NOT_FOUND'; end if;

  perform public.log_audit_event(null, case when p_active then 'admin_coupon_activated' else 'admin_coupon_deactivated' end, 'coupon', v_coupon.id, jsonb_build_object('code', v_coupon.code));

  return v_coupon;
end;
$$;

grant execute on function public.admin_set_coupon_active_system(uuid, boolean) to authenticated;

create or replace function public.admin_delete_coupon_system(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text;
  v_used_count bigint;
begin
  perform public._require_platform_admin();

  select code into v_code from public.coupons where id = p_coupon_id;
  if v_code is null then raise exception 'COUPON_NOT_FOUND'; end if;

  select count(*) into v_used_count from public.coupon_redemptions where coupon_id = p_coupon_id;
  if v_used_count > 0 then
    raise exception 'COUPON_HAS_REDEMPTIONS_CANNOT_DELETE' using hint = 'Desative o cupom em vez de excluir — ele já tem histórico de uso.';
  end if;

  delete from public.coupons where id = p_coupon_id;

  perform public.log_audit_event(null, 'admin_coupon_deleted', 'coupon', p_coupon_id, jsonb_build_object('code', v_code));
end;
$$;

grant execute on function public.admin_delete_coupon_system(uuid) to authenticated;

create or replace function public.admin_dashboard_metrics_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active_count bigint;
  v_expired_count bigint;
  v_total_redemptions bigint;
  v_total_discount_cents bigint;
  v_subscriptions_from_coupons bigint;
begin
  perform public._require_platform_admin();

  select count(*) into v_active_count
  from public.coupons c
  where public._coupon_derived_status(c, (select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved','applied'))) = 'active';

  select count(*) into v_expired_count
  from public.coupons c
  where public._coupon_derived_status(c, (select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved','applied'))) = 'expired';

  select count(*) into v_total_redemptions from public.coupon_redemptions where status = 'applied';
  select coalesce(sum(discount_amount_cents), 0) into v_total_discount_cents from public.coupon_redemptions where status = 'applied';
  select count(distinct subscription_id) into v_subscriptions_from_coupons from public.coupon_redemptions where status = 'applied' and subscription_id is not null;

  return jsonb_build_object(
    'active_coupons', v_active_count,
    'expired_coupons', v_expired_count,
    'total_redemptions', v_total_redemptions,
    'total_discount_granted_cents', v_total_discount_cents,
    'subscriptions_originated_with_coupon', v_subscriptions_from_coupons
  );
end;
$$;

grant execute on function public.admin_dashboard_metrics_system() to authenticated;
