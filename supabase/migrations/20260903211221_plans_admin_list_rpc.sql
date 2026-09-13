create or replace function public.admin_list_plans_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  perform public._require_platform_admin();

  select jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'price_monthly_cents', p.price_monthly_cents,
      'price_yearly_cents', p.price_yearly_cents,
      'is_active', p.is_active,
      'monthly_content_allowance', p.monthly_content_allowance,
      'max_workspaces', p.max_workspaces,
      'max_members', p.max_members,
      'sort_order', p.sort_order,
      'updated_at', p.updated_at,
      'last_price_change_at', (
        select max(h.created_at) from public.plan_change_history h
        where h.plan_id = p.id and h.field in ('monthly', 'yearly', 'monthly_and_yearly')
      ),
      'last_name_change_at', (
        select max(h.created_at) from public.plan_change_history h
        where h.plan_id = p.id and h.field = 'name'
      )
    ) order by p.sort_order
  )
  into v_result
  from public.plans p;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_plans_system() from public;
grant execute on function public.admin_list_plans_system() to authenticated;
