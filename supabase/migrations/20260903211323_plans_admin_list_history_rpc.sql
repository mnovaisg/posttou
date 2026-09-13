create or replace function public.admin_list_plan_change_history_system(
  p_plan_id text default null,
  p_limit integer default 50,
  p_cursor timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform public._require_platform_admin();

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
  from (
    select
      h.id, h.plan_id, h.change_type, h.field,
      h.previous_monthly_cents, h.new_monthly_cents,
      h.previous_yearly_cents, h.new_yearly_cents,
      h.previous_name, h.new_name,
      h.percent_applied, h.rounding_rule, h.note, h.batch_id,
      h.restored_from_history_id, h.created_at,
      h.admin_user_id,
      coalesce(pr.full_name, u.email) as admin_display_name
    from public.plan_change_history h
    left join public.profiles pr on pr.id = h.admin_user_id
    left join auth.users u on u.id = h.admin_user_id
    where (p_plan_id is null or h.plan_id = p_plan_id)
      and (p_cursor is null or h.created_at < p_cursor)
    order by h.created_at desc
    limit v_limit
  ) t;

  return v_result;
end;
$$;

revoke execute on function public.admin_list_plan_change_history_system(text, integer, timestamptz) from public;
grant execute on function public.admin_list_plan_change_history_system(text, integer, timestamptz) to authenticated;
