-- Perfil 360º de uma organização. Financeiro usa só o que já está
-- sincronizado localmente (subscriptions, coupon_redemptions,
-- subscription_status_history) — nunca chama o Asaas ao vivo.
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
      left join public.instagram_accounts ia on ia.workspace_id = b.workspace_id and ia.status = 'connected'
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
        'instagram_connected', exists(select 1 from public.instagram_accounts ia2 where ia2.workspace_id = b.workspace_id and ia2.status = 'connected'),
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

revoke execute on function public.admin_get_lead_detail_system(uuid) from public;
grant execute on function public.admin_get_lead_detail_system(uuid) to authenticated;
