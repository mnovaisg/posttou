
-- Bug real encontrado ao testar Bloco 10 ao vivo: `text[] || 'literal'`
-- lança "malformed array literal" quando o array começa vazio ('{}') —
-- ambiguidade de resolução de operador do Postgres entre anyarray||anyarray
-- (via cast implícito do literal pra array) e anyarray||anyelement. Trocado
-- por array_append(), que nunca é ambíguo.
create or replace function public.check_pilot_activation_readiness(p_workspace_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_settings public.pilot_settings;
  v_brand public.brand_profiles;
  v_balance bigint;
  v_min_cost bigint;
  v_slot_count int;
  v_missing text[] := '{}';
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace.';
  end if;

  select * into v_settings from public.pilot_settings where workspace_id = p_workspace_id;
  if v_settings.id is null then
    v_missing := array_append(v_missing, 'settings_not_created');
  end if;

  select * into v_brand from public.brand_profiles where workspace_id = p_workspace_id;
  if v_brand.id is null or v_brand.company_name is null or v_brand.description is null or v_brand.onboarding_completed_at is null then
    v_missing := array_append(v_missing, 'brand_dna_incomplete');
  end if;

  select count(*) into v_slot_count from public.pilot_schedule_slots where workspace_id = p_workspace_id;
  if coalesce(v_slot_count, 0) < 1 then
    v_missing := array_append(v_missing, 'schedule_not_set');
  end if;

  if v_settings.id is not null then
    if v_settings.allowed_formats is null or array_length(v_settings.allowed_formats, 1) is null then
      v_missing := array_append(v_missing, 'formats_not_set');
    end if;
    if v_settings.max_posts_per_window is null or v_settings.max_posts_per_window <= 0 then
      v_missing := array_append(v_missing, 'frequency_not_set');
    end if;
  end if;

  select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id;
  select min(credit_cost) into v_min_cost from public.ai_operation_costs where generation_type in ('post_unico', 'carrossel');
  if v_balance is null or v_min_cost is null or v_balance < v_min_cost then
    v_missing := array_append(v_missing, 'insufficient_credits');
  end if;

  return jsonb_build_object('ready', array_length(v_missing, 1) is null, 'missing', to_jsonb(v_missing));
end;
$function$;
