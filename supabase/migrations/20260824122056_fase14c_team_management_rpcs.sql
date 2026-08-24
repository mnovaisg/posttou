
-- Conta usuários únicos da organization (membros existentes + convites
-- pendentes não expirados cujo e-mail ainda não corresponde a um membro
-- já existente) — decisão explícita da Fase 14C: limite do plano é por
-- ORGANIZATION, compartilhado entre todas as marcas da Agência.
create or replace function public.count_organization_seats_used(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select (
    select count(distinct wm.user_id)
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.organization_id = p_organization_id
  ) + (
    select count(distinct lower(oi.email))
    from public.organization_invites oi
    where oi.organization_id = p_organization_id
      and oi.status = 'pending'
      and oi.expires_at > now()
      and not exists (
        select 1 from public.workspace_members wm2
        join public.workspaces w2 on w2.id = wm2.workspace_id
        join auth.users u on u.id = wm2.user_id
        where w2.organization_id = p_organization_id and lower(u.email) = lower(oi.email)
      )
  );
$$;

grant execute on function public.count_organization_seats_used(uuid) to authenticated, service_role;

create or replace function public.list_organization_members(p_organization_id uuid)
returns table(workspace_id uuid, workspace_name text, user_id uuid, email text, full_name text, role public.workspace_role, member_since timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select w.id, w.name, wm.user_id, u.email::text, p.full_name, wm.role, wm.created_at
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  join auth.users u on u.id = wm.user_id
  left join public.profiles p on p.id = wm.user_id
  where w.organization_id = p_organization_id and public.is_organization_member(p_organization_id)
  order by w.name, wm.created_at;
$$;

grant execute on function public.list_organization_members(uuid) to authenticated;

create or replace function public.list_organization_invites(p_organization_id uuid)
returns table(id uuid, workspace_id uuid, workspace_name text, email text, role public.workspace_role, status text, expires_at timestamptz, created_at timestamptz, invited_by_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select oi.id, oi.workspace_id, w.name, oi.email, oi.role, oi.status, oi.expires_at, oi.created_at, p.full_name
  from public.organization_invites oi
  join public.workspaces w on w.id = oi.workspace_id
  left join public.profiles p on p.id = oi.invited_by
  where oi.organization_id = p_organization_id and public.is_organization_member(p_organization_id)
  order by oi.created_at desc;
$$;

grant execute on function public.list_organization_invites(uuid) to authenticated;

-- Cria (ou reaproveita, se já houver um convite pendente para o mesmo
-- e-mail+workspace — idempotente, evita inflar a contagem de seats com
-- duplicatas) um convite. Retorna o token BRUTO uma única vez — quem
-- chama (a Edge Function) é responsável por enviar por e-mail; o banco só
-- guarda o hash.
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

  -- lock dedicado (chave diferente do gate de franquia) para serializar
  -- convites/aceites concorrentes da mesma organization.
  perform pg_advisory_xact_lock(hashtext(v_org_id::text || ':seats'));

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null or public.get_effective_subscription_status(v_sub) in ('expired','cancelled') then
    raise exception 'SUBSCRIPTION_NOT_ACTIVE';
  end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;

  -- convite pendente já existente pro mesmo e-mail+workspace: reaproveita
  -- (atualiza token/expiração) em vez de criar um novo, para não inflar a
  -- contagem de seats com duplicatas do mesmo convite.
  select id into v_invite_id from public.organization_invites
  where workspace_id = p_workspace_id and lower(email) = v_email and status = 'pending';

  if v_invite_id is null then
    v_seats_used := public.count_organization_seats_used(v_org_id);
    if v_seats_used >= v_plan.max_members then
      raise exception 'MAX_MEMBERS_REACHED';
    end if;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

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

grant execute on function public.create_organization_invite(uuid, text, public.workspace_role) to authenticated;

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

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.organization_invites
  set token_hash = v_token_hash, expires_at = now() + interval '7 days', updated_at = now()
  where id = p_invite_id;

  perform public.log_audit_event(v_invite.workspace_id, 'team_invite_resent', 'organization_invites', p_invite_id, '{}'::jsonb);

  return query select p_invite_id, v_token;
end;
$$;

grant execute on function public.resend_organization_invite(uuid) to authenticated;

create or replace function public.cancel_organization_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.organization_invites;
begin
  select * into v_invite from public.organization_invites where id = p_invite_id;
  if v_invite is null then raise exception 'INVITE_NOT_FOUND'; end if;

  if not public.has_workspace_role(v_invite.workspace_id, array['owner','admin']::public.workspace_role[]) then
    raise exception 'ONLY_OWNER_OR_ADMIN_CAN_CANCEL';
  end if;

  update public.organization_invites set status = 'cancelled', updated_at = now() where id = p_invite_id and status = 'pending';
  perform public.log_audit_event(v_invite.workspace_id, 'team_invite_cancelled', 'organization_invites', p_invite_id, '{}'::jsonb);
end;
$$;

grant execute on function public.cancel_organization_invite(uuid) to authenticated;
