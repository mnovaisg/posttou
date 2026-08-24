
-- Bug real encontrado em teste: pgcrypto vive no schema extensions (não
-- public) neste projeto — funções com search_path='public' não
-- encontravam gen_random_bytes/digest sem qualificação explícita.
create or replace function public.create_organization_invite(p_workspace_id uuid, p_email text, p_role public.workspace_role)
returns table(invite_id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_plan public.plans;
  v_sub public.subscriptions;
  v_seats_used integer;
  v_email text := lower(trim(p_email));
  v_token text;
  v_token_hash text;
  v_invite_id uuid;
  v_existing_member boolean;
begin
  select organization_id into v_org_id from public.workspaces where id = p_workspace_id;
  if v_org_id is null then raise exception 'WORKSPACE_NOT_FOUND'; end if;

  if not public.has_workspace_role(p_workspace_id, array['owner','admin']::public.workspace_role[]) then
    raise exception 'ONLY_OWNER_OR_ADMIN_CAN_INVITE';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  select exists (
    select 1 from public.workspace_members wm join auth.users u on u.id = wm.user_id
    where wm.workspace_id = p_workspace_id and lower(u.email) = v_email
  ) into v_existing_member;
  if v_existing_member then raise exception 'ALREADY_A_MEMBER'; end if;

  perform pg_advisory_xact_lock(hashtext(v_org_id::text || ':seats'));

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null or public.get_effective_subscription_status(v_sub) in ('expired','cancelled') then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;

  select id into v_invite_id from public.organization_invites
  where workspace_id = p_workspace_id and lower(email) = v_email and status = 'pending';

  if v_invite_id is null then
    v_seats_used := public.count_organization_seats_used(v_org_id);
    if v_seats_used >= v_plan.max_members then
      raise exception 'MAX_MEMBERS_REACHED';
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  if v_invite_id is not null then
    update public.organization_invites
    set role = p_role, token_hash = v_token_hash, expires_at = now() + interval '7 days', updated_at = now(), invited_by = auth.uid()
    where id = v_invite_id;
  else
    insert into public.organization_invites (organization_id, workspace_id, email, role, invited_by, token_hash)
    values (v_org_id, p_workspace_id, v_email, p_role, auth.uid(), v_token_hash)
    returning id into v_invite_id;
  end if;

  perform public.log_audit_event(p_workspace_id, 'team_invite_created', 'organization_invites', v_invite_id, jsonb_build_object('email', v_email, 'role', p_role));

  return query select v_invite_id, v_token;
end;
$$;

create or replace function public.resend_organization_invite(p_invite_id uuid)
returns table(invite_id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.organization_invites;
  v_token text;
  v_token_hash text;
begin
  select * into v_invite from public.organization_invites where id = p_invite_id;
  if v_invite is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_invite.status <> 'pending' then raise exception 'INVITE_NOT_PENDING'; end if;

  if not public.has_workspace_role(v_invite.workspace_id, array['owner','admin']::public.workspace_role[]) then
    raise exception 'ONLY_OWNER_OR_ADMIN_CAN_RESEND';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.organization_invites
  set token_hash = v_token_hash, expires_at = now() + interval '7 days', updated_at = now()
  where id = p_invite_id;

  perform public.log_audit_event(v_invite.workspace_id, 'team_invite_resent', 'organization_invites', p_invite_id, '{}'::jsonb);

  return query select p_invite_id, v_token;
end;
$$;

create or replace function public.accept_organization_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token_hash text;
  v_invite public.organization_invites;
  v_caller_email text;
  v_org_id uuid;
  v_plan public.plans;
  v_sub public.subscriptions;
  v_already_member boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from public.organization_invites where token_hash = v_token_hash;

  if v_invite is null then raise exception 'INVITE_INVALID'; end if;
  if v_invite.status <> 'pending' then raise exception 'INVITE_ALREADY_USED_OR_CANCELLED'; end if;
  if v_invite.expires_at < now() then
    update public.organization_invites set status = 'expired', updated_at = now() where id = v_invite.id;
    raise exception 'INVITE_EXPIRED';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();
  if lower(v_caller_email) <> lower(v_invite.email) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  v_org_id := v_invite.organization_id;
  perform pg_advisory_xact_lock(hashtext(v_org_id::text || ':seats'));

  select exists (select 1 from public.workspace_members where workspace_id = v_invite.workspace_id and user_id = auth.uid()) into v_already_member;

  if not v_already_member then
    select * into v_sub from public.subscriptions where organization_id = v_org_id;
    select * into v_plan from public.plans where id = v_sub.plan_id;
    if public.count_organization_seats_used(v_org_id) > v_plan.max_members then
      raise exception 'MAX_MEMBERS_REACHED';
    end if;

    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (v_invite.workspace_id, auth.uid(), v_invite.role, v_invite.invited_by);
  else
    update public.workspace_members set role = v_invite.role where workspace_id = v_invite.workspace_id and user_id = auth.uid();
  end if;

  update public.organization_invites
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
  where id = v_invite.id;

  perform public.log_audit_event(v_invite.workspace_id, 'team_invite_accepted', 'organization_invites', v_invite.id, jsonb_build_object('email', v_invite.email));

  return jsonb_build_object('workspace_id', v_invite.workspace_id, 'organization_id', v_org_id, 'role', v_invite.role);
end;
$$;

create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_token_hash text;
  v_invite public.organization_invites;
  v_workspace_name text;
  v_org_name text;
begin
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from public.organization_invites where token_hash = v_token_hash;
  if v_invite is null or v_invite.status <> 'pending' or v_invite.expires_at < now() then
    return jsonb_build_object('valid', false);
  end if;
  select name into v_workspace_name from public.workspaces where id = v_invite.workspace_id;
  select name into v_org_name from public.organizations where id = v_invite.organization_id;
  return jsonb_build_object('valid', true, 'email', v_invite.email, 'role', v_invite.role, 'workspace_name', v_workspace_name, 'organization_name', v_org_name);
end;
$$;
