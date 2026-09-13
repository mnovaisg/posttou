create or replace function public.admin_list_leads_system(
  p_search text default null,
  p_status text default null,
  p_plan_id text default null,
  p_billing_interval billing_interval default null,
  p_signup_from timestamptz default null,
  p_signup_to timestamptz default null,
  p_coupon_code text default null,
  p_utm_source text default null,
  p_utm_campaign text default null,
  p_marketing_email boolean default null,
  p_marketing_whatsapp boolean default null,
  p_inactive_days integer default null,
  p_include_deleted boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  perform public._require_platform_admin();

  with base as (
    select b.*, u.email, p.full_name, p.whatsapp, p.deleted_at
    from public._admin_lead_base() b
    join auth.users u on u.id = b.owner_user_id
    join public.profiles p on p.id = b.owner_user_id
  ),
  enriched as (
    select
      b.*,
      bp.company_name,
      coalesce(ia.username, bp.instagram_handle) as instagram,
      b.sub.plan_id as plan_id,
      pl.name as plan_name,
      b.sub.billing_interval as billing_interval,
      (
        select max(al.created_at) from public.audit_logs al
        where al.workspace_id in (select w3.id from public.workspaces w3 where w3.organization_id = b.organization_id)
      ) as last_activity_at,
      la.utm_source, la.utm_medium, la.utm_campaign, la.utm_content, la.utm_term, la.coupon_code_at_signup,
      (
        select mc.opted_in from public.marketing_consents mc
        where mc.user_id = b.owner_user_id and mc.channel = 'email' order by mc.changed_at desc limit 1
      ) as marketing_email_opt_in,
      (
        select mc.opted_in from public.marketing_consents mc
        where mc.user_id = b.owner_user_id and mc.channel = 'whatsapp' order by mc.changed_at desc limit 1
      ) as marketing_whatsapp_opt_in
    from base b
    left join public.brand_profiles bp on bp.workspace_id = b.workspace_id
    left join public.instagram_accounts ia on ia.workspace_id = b.workspace_id and ia.status = 'conectado'
    left join public.plans pl on pl.id = b.sub.plan_id
    left join public.lead_attribution la on la.organization_id = b.organization_id
  ),
  filtered as (
    select * from enriched e
    where (p_include_deleted or e.deleted_at is null)
      and (p_search is null or p_search = '' or
           e.full_name ilike '%'||p_search||'%' or
           e.email ilike '%'||p_search||'%' or
           e.whatsapp ilike '%'||p_search||'%' or
           e.instagram ilike '%'||p_search||'%' or
           e.company_name ilike '%'||p_search||'%' or
           e.organization_name ilike '%'||p_search||'%')
      and (p_status is null or p_status = '' or e.commercial_status = p_status)
      and (p_plan_id is null or p_plan_id = '' or e.plan_id = p_plan_id)
      and (p_billing_interval is null or e.billing_interval = p_billing_interval)
      and (p_signup_from is null or e.organization_created_at >= p_signup_from)
      and (p_signup_to is null or e.organization_created_at <= p_signup_to)
      and (p_coupon_code is null or p_coupon_code = '' or e.coupon_code_at_signup ilike p_coupon_code)
      and (p_utm_source is null or p_utm_source = '' or e.utm_source ilike p_utm_source)
      and (p_utm_campaign is null or p_utm_campaign = '' or e.utm_campaign ilike p_utm_campaign)
      and (p_marketing_email is null or e.marketing_email_opt_in is not distinct from p_marketing_email)
      and (p_marketing_whatsapp is null or e.marketing_whatsapp_opt_in is not distinct from p_marketing_whatsapp)
      and (p_inactive_days is null or e.last_activity_at is null or e.last_activity_at < now() - make_interval(days => p_inactive_days))
  ),
  numbered as (
    select *, row_number() over (order by organization_created_at desc) as rn
    from filtered
  )
  select jsonb_build_object(
    'total', (select count(*) from numbered),
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'organization_id', n.organization_id,
        'workspace_id', n.workspace_id,
        'owner_user_id', n.owner_user_id,
        'full_name', n.full_name,
        'email', n.email,
        'whatsapp', n.whatsapp,
        'instagram', n.instagram,
        'company_name', coalesce(n.company_name, n.organization_name),
        'plan_id', n.plan_id,
        'plan_name', n.plan_name,
        'billing_interval', n.billing_interval,
        'commercial_status', n.commercial_status,
        'past_due_since', n.sub.past_due_since,
        'created_at', n.organization_created_at,
        'last_activity_at', n.last_activity_at,
        'coupon_code_at_signup', n.coupon_code_at_signup,
        'utm_source', n.utm_source,
        'utm_campaign', n.utm_campaign,
        'marketing_email_opt_in', n.marketing_email_opt_in,
        'marketing_whatsapp_opt_in', n.marketing_whatsapp_opt_in
      ) order by n.organization_created_at desc
    ) filter (where n.rn > p_offset and n.rn <= p_offset + p_limit), '[]'::jsonb)
  )
  into v_result
  from numbered n;

  return v_result;
end;
$$;

create or replace function public.admin_get_lead_detail_system(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_owner uuid;
begin
  perform public._require_platform_admin();

  select owner_user_id into v_owner from public.organizations where id = p_organization_id;
  if v_owner is null then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  with b as (
    select * from public._admin_lead_base() where organization_id = p_organization_id
  )
  select jsonb_build_object(
    'identification', (
      select jsonb_build_object(
        'organization_id', b.organization_id,
        'owner_user_id', b.owner_user_id,
        'full_name', p.full_name,
        'email', u.email,
        'whatsapp', p.whatsapp,
        'company_name', coalesce(bp.company_name, b.organization_name),
        'instagram', coalesce(ia.username, bp.instagram_handle),
        'signed_up_at', b.organization_created_at,
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'deleted_at', p.deleted_at
      )
      from b
      join auth.users u on u.id = b.owner_user_id
      join public.profiles p on p.id = b.owner_user_id
      left join public.brand_profiles bp on bp.workspace_id = b.workspace_id
      left join public.instagram_accounts ia on ia.workspace_id = b.workspace_id and ia.status = 'conectado'
    ),
    'commercial_status', (select commercial_status from b),
    'subscription', (
      select jsonb_build_object(
        'plan_id', (b.sub).plan_id,
        'plan_name', pl.name,
        'billing_interval', (b.sub).billing_interval,
        'status', (b.sub).status,
        'trial_ends_at', (b.sub).trial_ends_at,
        'activated_at', (b.sub).activated_at,
        'current_period_start', (b.sub).current_period_start,
        'current_period_end', (b.sub).current_period_end,
        'cancel_at_period_end', (b.sub).cancel_at_period_end,
        'past_due_since', (b.sub).past_due_since,
        'price_monthly_cents', pl.price_monthly_cents,
        'price_yearly_cents', pl.price_yearly_cents
      )
      from b left join public.plans pl on pl.id = (b.sub).plan_id
    ),
    'journey', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'from_status', h.from_status, 'to_status', h.to_status, 'reason', h.reason, 'created_at', h.created_at
      ) order by h.created_at asc), '[]'::jsonb)
      from public.subscription_status_history h where h.organization_id = p_organization_id
    ),
    'financial', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'coupon_code', c.code,
        'original_amount_cents', cr.original_amount_cents,
        'discount_amount_cents', cr.discount_amount_cents,
        'final_amount_cents', cr.final_amount_cents,
        'status', cr.status,
        'created_at', cr.created_at
      ) order by cr.created_at desc), '[]'::jsonb)
      from public.coupon_redemptions cr join public.coupons c on c.id = cr.coupon_id
      where cr.organization_id = p_organization_id
    ),
    'attribution', (
      select jsonb_build_object(
        'utm_source', la.utm_source, 'utm_medium', la.utm_medium, 'utm_campaign', la.utm_campaign,
        'utm_content', la.utm_content, 'utm_term', la.utm_term,
        'coupon_code_at_signup', la.coupon_code_at_signup, 'captured_at', la.captured_at
      )
      from public.lead_attribution la where la.organization_id = p_organization_id
    ),
    'product', (
      select jsonb_build_object(
        'workspace_id', b.workspace_id,
        'credits_balance', (select ca.balance from public.credit_accounts ca where ca.workspace_id = b.workspace_id),
        'dna_completed', exists(select 1 from public.brand_profiles bp2 where bp2.workspace_id = b.workspace_id and bp2.onboarding_completed_at is not null),
        'instagram_connected', exists(select 1 from public.instagram_accounts ia2 where ia2.workspace_id = b.workspace_id and ia2.status = 'conectado'),
        'contents_count', (select count(*) from public.contents ct where ct.workspace_id = b.workspace_id and ct.deleted_at is null),
        'last_activity_at', (select max(al.created_at) from public.audit_logs al where al.workspace_id = b.workspace_id)
      )
      from b
    ),
    'marketing_consent', (
      select jsonb_build_object(
        'email', (select jsonb_build_object('opted_in', mc.opted_in, 'changed_at', mc.changed_at, 'source', mc.source)
                   from public.marketing_consents mc where mc.user_id = v_owner and mc.channel = 'email' order by mc.changed_at desc limit 1),
        'whatsapp', (select jsonb_build_object('opted_in', mc.opted_in, 'changed_at', mc.changed_at, 'source', mc.source)
                   from public.marketing_consents mc where mc.user_id = v_owner and mc.channel = 'whatsapp' order by mc.changed_at desc limit 1)
      )
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'author_email', u2.email, 'created_at', n.created_at
      ) order by n.created_at desc), '[]'::jsonb)
      from public.lead_notes n join auth.users u2 on u2.id = n.author_user_id
      where n.organization_id = p_organization_id
    ),
    'tags', (
      select coalesce(t.tags, '{}') from public.lead_tags t where t.organization_id = p_organization_id
    ),
    'follow_ups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'action_type', f.action_type, 'due_at', f.due_at, 'note', f.note,
        'status', f.status, 'created_at', f.created_at, 'completed_at', f.completed_at
      ) order by f.created_at desc), '[]'::jsonb)
      from public.lead_follow_ups f where f.organization_id = p_organization_id
    )
  )
  into v_result;

  return v_result;
end;
$$;
