
-- Aceite de convite: só o usuário autenticado cujo e-mail bate com o do
-- convite pode aceitar — impede que um convite manipulado (token
-- adivinhado/roubado) seja usado por outra conta pra entrar em
-- organization/workspace diferente. Token nunca é comparado em texto
-- puro: comparamos o hash.
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

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
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
    -- reavalia o limite no momento do aceite (pode ter mudado desde o convite,
    -- ex.: downgrade de plano aplicado nesse meio-tempo).
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

grant execute on function public.accept_organization_invite(text) to authenticated;

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
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  select * into v_invite from public.organization_invites where token_hash = v_token_hash;
  if v_invite is null or v_invite.status <> 'pending' or v_invite.expires_at < now() then
    return jsonb_build_object('valid', false);
  end if;
  select name into v_workspace_name from public.workspaces where id = v_invite.workspace_id;
  select name into v_org_name from public.organizations where id = v_invite.organization_id;
  return jsonb_build_object('valid', true, 'email', v_invite.email, 'role', v_invite.role, 'workspace_name', v_workspace_name, 'organization_name', v_org_name);
end;
$$;

grant execute on function public.get_invite_preview(text) to authenticated, anon;

create or replace function public.change_member_role(p_workspace_id uuid, p_user_id uuid, p_new_role public.workspace_role)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_workspace_role(p_workspace_id, array['owner','admin']::public.workspace_role[]) then
    raise exception 'ONLY_OWNER_OR_ADMIN_CAN_CHANGE_ROLE';
  end if;

  -- update direto: o trigger prevent_last_owner_removal já bloqueia
  -- rebaixar o último owner (dispara em UPDATE quando old.role='owner'
  -- and new.role<>'owner').
  update public.workspace_members set role = p_new_role, updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id;

  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  perform public.log_audit_event(p_workspace_id, 'team_member_role_changed', 'workspace_members', p_user_id, jsonb_build_object('new_role', p_new_role));
end;
$$;

grant execute on function public.change_member_role(uuid, uuid, public.workspace_role) to authenticated;

create or replace function public.remove_organization_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_workspace_role(p_workspace_id, array['owner','admin']::public.workspace_role[]) then
    raise exception 'ONLY_OWNER_OR_ADMIN_CAN_REMOVE_MEMBER';
  end if;

  -- delete direto: o trigger prevent_last_owner_removal já bloqueia
  -- remover o último owner.
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;

  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  perform public.log_audit_event(p_workspace_id, 'team_member_removed', 'workspace_members', p_user_id, '{}'::jsonb);
end;
$$;

grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
