
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
    select 1 from public.instagram_accounts where workspace_id = p_workspace_id and status = 'conectado'
  ) into v_has_instagram;

  select exists(
    select 1 from public.instagram_publications ip
    join public.instagram_accounts ia on ia.id = ip.instagram_account_id
    where ia.workspace_id = p_workspace_id and ip.status = 'publicado'
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
