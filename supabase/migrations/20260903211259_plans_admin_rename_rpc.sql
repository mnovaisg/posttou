create or replace function public.admin_rename_plan_system(
  p_plan_id text,
  p_new_name text,
  p_note text default null
)
returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current public.plans;
  v_new_name text := trim(coalesce(p_new_name, ''));
  v_row public.plans;
begin
  perform public._require_platform_admin();

  if v_new_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  select * into v_current from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if v_current.name = v_new_name then
    return v_current;
  end if;

  update public.plans set name = v_new_name, updated_at = now()
  where id = p_plan_id
  returning * into v_row;

  insert into public.plan_change_history (
    plan_id, change_type, field, previous_name, new_name, note, admin_user_id
  ) values (
    p_plan_id, 'rename', 'name', v_current.name, v_new_name, p_note, auth.uid()
  );

  perform public.log_audit_event(
    null, 'admin_plan_renamed', 'plans', null,
    jsonb_build_object('plan_id', p_plan_id, 'previous_name', v_current.name, 'new_name', v_new_name)
  );

  return v_row;
end;
$$;

revoke execute on function public.admin_rename_plan_system(text, text, text) from public;
grant execute on function public.admin_rename_plan_system(text, text, text) to authenticated;
