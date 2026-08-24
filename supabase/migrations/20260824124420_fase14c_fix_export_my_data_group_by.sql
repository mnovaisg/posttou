
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'auth_email', (select email from auth.users where id = v_uid),
    'organizations_owned', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.organizations o where o.owner_user_id = v_uid),
    'workspace_memberships', (
      select coalesce(jsonb_agg(jsonb_build_object('workspace_id', wm.workspace_id, 'workspace_name', w.name, 'role', wm.role, 'since', wm.created_at)), '[]'::jsonb)
      from public.workspace_members wm join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = v_uid
    ),
    'contents_created', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'type', c.type, 'status', c.status, 'created_at', c.created_at)), '[]'::jsonb)
      from public.contents c where c.created_by = v_uid
    ),
    'audit_log_entries', (
      select coalesce(jsonb_agg(jsonb_build_object('action', ordered.action, 'resource_type', ordered.resource_type, 'created_at', ordered.created_at)), '[]'::jsonb)
      from (
        select action, resource_type, created_at from public.audit_logs
        where user_id = v_uid order by created_at desc limit 500
      ) ordered
    ),
    'legal_acceptances', (
      select coalesce(jsonb_agg(to_jsonb(la)), '[]'::jsonb) from public.legal_acceptances la where la.user_id = v_uid
    )
  );
end;
$$;
