create or replace function public.admin_add_lead_note_system(p_organization_id uuid, p_body text)
returns public.lead_notes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.lead_notes;
begin
  perform public._require_platform_admin();
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'EMPTY_NOTE';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  insert into public.lead_notes (organization_id, author_user_id, body)
  values (p_organization_id, auth.uid(), trim(p_body))
  returning * into v_row;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (null, auth.uid(), 'admin_lead_note_added', 'lead_notes', v_row.id, jsonb_build_object('organization_id', p_organization_id));

  return v_row;
end;
$$;
revoke execute on function public.admin_add_lead_note_system(uuid, text) from public;
grant execute on function public.admin_add_lead_note_system(uuid, text) to authenticated;

create or replace function public.admin_set_lead_tags_system(p_organization_id uuid, p_tags text[])
returns public.lead_tags
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.lead_tags;
  v_clean text[];
begin
  perform public._require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  select coalesce(array_agg(distinct trim(t)), '{}') into v_clean
  from unnest(coalesce(p_tags, '{}')) as t
  where trim(t) <> '';

  insert into public.lead_tags (organization_id, tags, updated_by, updated_at)
  values (p_organization_id, v_clean, auth.uid(), now())
  on conflict (organization_id) do update set tags = excluded.tags, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (null, auth.uid(), 'admin_lead_tags_updated', 'lead_tags', p_organization_id, jsonb_build_object('tags', v_clean));

  return v_row;
end;
$$;
revoke execute on function public.admin_set_lead_tags_system(uuid, text[]) from public;
grant execute on function public.admin_set_lead_tags_system(uuid, text[]) to authenticated;

create or replace function public.admin_add_lead_follow_up_system(p_organization_id uuid, p_action_type text, p_due_at date, p_note text)
returns public.lead_follow_ups
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.lead_follow_ups;
begin
  perform public._require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  insert into public.lead_follow_ups (organization_id, action_type, due_at, note, created_by)
  values (p_organization_id, p_action_type, p_due_at, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_row;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (null, auth.uid(), 'admin_lead_follow_up_added', 'lead_follow_ups', v_row.id, jsonb_build_object('organization_id', p_organization_id, 'action_type', p_action_type));

  return v_row;
end;
$$;
revoke execute on function public.admin_add_lead_follow_up_system(uuid, text, date, text) from public;
grant execute on function public.admin_add_lead_follow_up_system(uuid, text, date, text) to authenticated;

create or replace function public.admin_complete_lead_follow_up_system(p_follow_up_id uuid)
returns public.lead_follow_ups
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.lead_follow_ups;
begin
  perform public._require_platform_admin();

  update public.lead_follow_ups
  set status = 'done', completed_at = now()
  where id = p_follow_up_id
  returning * into v_row;

  if v_row is null then
    raise exception 'FOLLOW_UP_NOT_FOUND';
  end if;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (null, auth.uid(), 'admin_lead_follow_up_completed', 'lead_follow_ups', v_row.id, jsonb_build_object('organization_id', v_row.organization_id));

  return v_row;
end;
$$;
revoke execute on function public.admin_complete_lead_follow_up_system(uuid) from public;
grant execute on function public.admin_complete_lead_follow_up_system(uuid) to authenticated;
