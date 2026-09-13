create or replace function public.admin_list_billing_charges_system(
  p_status text default null,
  p_search text default null,
  p_period_start date default null,
  p_period_end date default null,
  p_limit integer default 50,
  p_offset integer default 0
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

  with base as (
    select
      bc.*, o.name as organization_name, o.owner_user_id,
      u.email as owner_email, pl.name as plan_name
    from public.billing_charges bc
    join public.organizations o on o.id = bc.organization_id
    join auth.users u on u.id = o.owner_user_id
    left join public.plans pl on pl.id = bc.plan_id
    where (p_status is null or p_status = '' or bc.status = p_status)
      and (p_period_start is null or bc.due_date >= p_period_start)
      and (p_period_end is null or bc.due_date <= p_period_end)
      and (p_search is null or p_search = '' or o.name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
  ),
  numbered as (
    select *, row_number() over (order by due_date desc) as rn from base
  )
  select jsonb_build_object(
    'total', (select count(*) from numbered),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'organization_id', n.organization_id,
      'organization_name', n.organization_name,
      'owner_email', n.owner_email,
      'plan_name', n.plan_name,
      'billing_interval', n.billing_interval,
      'original_amount_cents', n.original_amount_cents,
      'discount_amount_cents', n.discount_amount_cents,
      'final_amount_cents', n.final_amount_cents,
      'due_date', n.due_date,
      'paid_at', n.paid_at,
      'status', n.status,
      'kind', n.kind
    ) order by n.due_date desc) filter (where n.rn > p_offset and n.rn <= p_offset + p_limit), '[]'::jsonb)
  )
  into v_result
  from numbered n;

  return v_result;
end;
$$;
revoke execute on function public.admin_list_billing_charges_system(text, text, date, date, integer, integer) from public;
grant execute on function public.admin_list_billing_charges_system(text, text, date, date, integer, integer) to authenticated;
