create or replace function public.admin_list_asaas_sync_issues_system()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  perform public._require_platform_admin();

  select coalesce(jsonb_agg(row_to_json(t) order by t.asaas_sync_attempted_at desc nulls last), '[]'::jsonb) into v_result
  from (
    select
      s.organization_id, o.name as organization_name, s.plan_id, s.billing_interval,
      s.asaas_subscription_id, s.asaas_sync_status, s.asaas_sync_target_price_cents,
      s.asaas_sync_last_error, s.asaas_sync_attempted_at
    from public.subscriptions s
    join public.organizations o on o.id = s.organization_id
    where s.asaas_sync_status in ('pending', 'failed')
  ) t;

  return v_result;
end;
$$;

revoke execute on function public.admin_list_asaas_sync_issues_system() from public;
grant execute on function public.admin_list_asaas_sync_issues_system() to authenticated;
