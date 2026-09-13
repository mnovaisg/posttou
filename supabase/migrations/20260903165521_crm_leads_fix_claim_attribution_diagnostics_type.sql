create or replace function public.claim_lead_attribution_system(
  p_organization_id uuid,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row_count integer;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'NOT_ORGANIZATION_MEMBER';
  end if;

  insert into public.lead_attribution (organization_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, coupon_code_at_signup)
  values (p_organization_id, nullif(p_utm_source,''), nullif(p_utm_medium,''), nullif(p_utm_campaign,''), nullif(p_utm_content,''), nullif(p_utm_term,''), nullif(p_coupon_code,''))
  on conflict (organization_id) do nothing;

  get diagnostics v_row_count = row_count;

  return jsonb_build_object('captured', v_row_count > 0);
end;
$$;
