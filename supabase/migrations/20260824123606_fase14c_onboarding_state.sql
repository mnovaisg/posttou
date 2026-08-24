
-- Fase 14C — onboarding guiado. Todo o PROGRESSO real é derivado dos
-- dados já existentes (brand_profiles, brand_visual_dna, contents,
-- instagram_accounts, instagram_publications, pilot_settings) — nunca
-- duplicado aqui. A única coisa que não tem nenhum rastro natural no
-- banco é "o usuário decidiu pular esta etapa/fechar o onboarding", por
-- isso essa tabela guarda só isso, por usuário+workspace (sobrevive a
-- logout/login, é por pessoa porque é preferência de UI, não progresso
-- real do workspace).
create table public.onboarding_progress (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_steps text[] not null default '{}',
  onboarding_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.onboarding_progress enable row level security;

create policy onboarding_progress_select_own on public.onboarding_progress for select to authenticated
  using (user_id = auth.uid());

-- Escrita só via RPC (garante workspace_id válido e pertencimento).

create or replace function public.get_onboarding_state(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_has_brand_dna boolean;
  v_has_visual_dna boolean;
  v_has_content boolean;
  v_has_instagram boolean;
  v_has_published boolean;
  v_pilot_active boolean;
  v_dismissed_steps text[];
  v_onboarding_dismissed boolean;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN';
  end if;

  select exists(
    select 1 from public.brand_profiles
    where workspace_id = p_workspace_id and company_name is not null and description is not null and onboarding_completed_at is not null
  ) into v_has_brand_dna;

  select exists(
    select 1 from public.brand_visual_dna where workspace_id = p_workspace_id and status = 'active'
  ) into v_has_visual_dna;

  select exists(
    select 1 from public.contents where workspace_id = p_workspace_id and deleted_at is null
  ) into v_has_content;

  select exists(
    select 1 from public.instagram_accounts where workspace_id = p_workspace_id and status = 'connected'
  ) into v_has_instagram;

  select exists(
    select 1 from public.instagram_publications ip
    join public.instagram_accounts ia on ia.id = ip.instagram_account_id
    where ia.workspace_id = p_workspace_id and ip.status = 'published'
  ) into v_has_published;

  select (status <> 'disabled') into v_pilot_active from public.pilot_settings where workspace_id = p_workspace_id;

  select coalesce(dismissed_steps, '{}'), coalesce(onboarding_dismissed, false)
  into v_dismissed_steps, v_onboarding_dismissed
  from public.onboarding_progress where workspace_id = p_workspace_id and user_id = auth.uid();

  return jsonb_build_object(
    'brand_dna_done', v_has_brand_dna,
    'visual_dna_done', v_has_visual_dna,
    'first_content_done', v_has_content,
    'instagram_connected_done', v_has_instagram,
    'first_publish_done', v_has_published,
    'pilot_active', coalesce(v_pilot_active, false),
    'dismissed_steps', to_jsonb(coalesce(v_dismissed_steps, '{}')),
    'onboarding_dismissed', v_onboarding_dismissed
  );
end;
$$;

grant execute on function public.get_onboarding_state(uuid) to authenticated;

create or replace function public.dismiss_onboarding_step(p_workspace_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'FORBIDDEN'; end if;

  insert into public.onboarding_progress (workspace_id, user_id, dismissed_steps)
  values (p_workspace_id, auth.uid(), array[p_step])
  on conflict (workspace_id, user_id) do update
    set dismissed_steps = case
      when p_step = any(public.onboarding_progress.dismissed_steps) then public.onboarding_progress.dismissed_steps
      else public.onboarding_progress.dismissed_steps || p_step
    end,
    updated_at = now();
end;
$$;

grant execute on function public.dismiss_onboarding_step(uuid, text) to authenticated;

create or replace function public.dismiss_onboarding(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'FORBIDDEN'; end if;

  insert into public.onboarding_progress (workspace_id, user_id, onboarding_dismissed)
  values (p_workspace_id, auth.uid(), true)
  on conflict (workspace_id, user_id) do update set onboarding_dismissed = true, updated_at = now();
end;
$$;

grant execute on function public.dismiss_onboarding(uuid) to authenticated;

revoke execute on function public.get_onboarding_state(uuid) from anon;
revoke execute on function public.dismiss_onboarding_step(uuid, text) from anon;
revoke execute on function public.dismiss_onboarding(uuid) from anon;
