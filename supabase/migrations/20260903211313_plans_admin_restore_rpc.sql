create or replace function public.admin_restore_plan_change_system(
  p_history_id uuid,
  p_note text default null
)
returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hist public.plan_change_history;
  v_current public.plans;
  v_row public.plans;
begin
  perform public._require_platform_admin();

  select * into v_hist from public.plan_change_history where id = p_history_id;
  if not found then
    raise exception 'HISTORY_ENTRY_NOT_FOUND';
  end if;

  select * into v_current from public.plans where id = v_hist.plan_id for update;
  if not found then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if v_hist.field = 'name' then
    if v_hist.previous_name is null then
      raise exception 'NOTHING_TO_RESTORE';
    end if;

    update public.plans set name = v_hist.previous_name, updated_at = now()
    where id = v_hist.plan_id
    returning * into v_row;

    insert into public.plan_change_history (
      plan_id, change_type, field, previous_name, new_name, note, restored_from_history_id, admin_user_id
    ) values (
      v_hist.plan_id, 'rename_restore', 'name', v_current.name, v_hist.previous_name, p_note, p_history_id, auth.uid()
    );

    perform public.log_audit_event(
      null, 'admin_plan_name_restored', 'plans', null,
      jsonb_build_object('plan_id', v_hist.plan_id, 'previous_name', v_current.name, 'restored_name', v_hist.previous_name, 'source_history_id', p_history_id)
    );
  else
    if v_hist.previous_monthly_cents is null and v_hist.previous_yearly_cents is null then
      raise exception 'NOTHING_TO_RESTORE';
    end if;

    update public.plans
    set
      price_monthly_cents = coalesce(v_hist.previous_monthly_cents, price_monthly_cents),
      price_yearly_cents = coalesce(v_hist.previous_yearly_cents, price_yearly_cents),
      updated_at = now()
    where id = v_hist.plan_id
    returning * into v_row;

    insert into public.plan_change_history (
      plan_id, change_type, field,
      previous_monthly_cents, new_monthly_cents,
      previous_yearly_cents, new_yearly_cents,
      note, restored_from_history_id, admin_user_id
    ) values (
      v_hist.plan_id, 'price_restore', v_hist.field,
      case when v_hist.previous_monthly_cents is not null then v_current.price_monthly_cents else null end,
      v_hist.previous_monthly_cents,
      case when v_hist.previous_yearly_cents is not null then v_current.price_yearly_cents else null end,
      v_hist.previous_yearly_cents,
      p_note, p_history_id, auth.uid()
    );

    perform public.log_audit_event(
      null, 'admin_plan_price_restored', 'plans', null,
      jsonb_build_object('plan_id', v_hist.plan_id, 'source_history_id', p_history_id, 'restored_monthly_cents', v_hist.previous_monthly_cents, 'restored_yearly_cents', v_hist.previous_yearly_cents)
    );
  end if;

  return v_row;
end;
$$;

revoke execute on function public.admin_restore_plan_change_system(uuid, text) from public;
grant execute on function public.admin_restore_plan_change_system(uuid, text) to authenticated;
