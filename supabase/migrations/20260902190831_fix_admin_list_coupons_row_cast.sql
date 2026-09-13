
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
  v_result jsonb;
begin
  perform public._require_platform_admin();

  with counted as (
    select
      c as coupon_row,
      coalesce((select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved','applied')), 0) as used_count
    from public.coupons c
    where (p_search is null or p_search = '' or c.code_normalized ilike '%' || upper(p_search) || '%')
  ),
  withstatus as (
    select
      coupon_row,
      used_count,
      public._coupon_derived_status(coupon_row, used_count) as derived_status
    from counted
  ),
  numbered as (
    select *, row_number() over (order by (coupon_row).created_at desc) as rn
    from withstatus
    where p_status is null or p_status = '' or derived_status = p_status
  )
  select jsonb_build_object(
    'total', (select count(*) from numbered),
    'items', coalesce(jsonb_agg(
      to_jsonb(n.coupon_row) || jsonb_build_object('used_count', n.used_count, 'derived_status', n.derived_status)
      order by (n.coupon_row).created_at desc
    ) filter (where n.rn > p_offset and n.rn <= p_offset + p_limit), '[]'::jsonb)
  )
  into v_result
  from numbered n;

  return v_result;
end;
$$;
