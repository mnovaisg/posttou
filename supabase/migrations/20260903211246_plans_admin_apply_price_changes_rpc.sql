-- p_items: jsonb array de {"plan_id": text, "new_monthly_cents": int|null, "new_yearly_cents": int|null}.
-- null em um campo = não altera aquele campo para aquele plano (ex.:
-- ajuste "somente mensal" em massa manda new_yearly_cents null pra
-- todos). Todos os itens são aplicados na mesma transação (ou tudo, ou
-- nada) e compartilham um batch_id — mesmo uma edição de um único plano
-- passa por aqui com um array de 1 item, pra manter uma única rota de
-- escrita/histórico.
create or replace function public.admin_apply_plan_price_changes_system(
  p_items jsonb,
  p_change_type text,
  p_percent_applied numeric default null,
  p_rounding_rule text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_item jsonb;
  v_plan_id text;
  v_new_monthly integer;
  v_new_yearly integer;
  v_current public.plans;
  v_monthly_changed boolean;
  v_yearly_changed boolean;
  v_field text;
  v_applied jsonb := '[]'::jsonb;
  v_admin_id uuid := auth.uid();
begin
  perform public._require_platform_admin();

  if p_change_type not in ('price_manual', 'price_percent', 'price_bulk') then
    raise exception 'INVALID_CHANGE_TYPE';
  end if;
  if p_rounding_rule is not null and p_rounding_rule not in ('exact', 'integer', 'commercial_9') then
    raise exception 'INVALID_ROUNDING_RULE';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_plan_id := v_item ->> 'plan_id';
    v_new_monthly := nullif(v_item ->> 'new_monthly_cents', '')::integer;
    v_new_yearly := nullif(v_item ->> 'new_yearly_cents', '')::integer;

    select * into v_current from public.plans where id = v_plan_id for update;
    if not found then
      raise exception 'PLAN_NOT_FOUND: %', v_plan_id;
    end if;

    if v_new_monthly is not null and v_new_monthly <= 0 then
      raise exception 'INVALID_MONTHLY_PRICE: %', v_plan_id;
    end if;
    if v_new_yearly is not null and v_new_yearly <= 0 then
      raise exception 'INVALID_YEARLY_PRICE: %', v_plan_id;
    end if;

    v_monthly_changed := v_new_monthly is not null and v_new_monthly <> v_current.price_monthly_cents;
    v_yearly_changed := v_new_yearly is not null and v_new_yearly <> v_current.price_yearly_cents;

    if not v_monthly_changed and not v_yearly_changed then
      continue;
    end if;

    v_field := case
      when v_monthly_changed and v_yearly_changed then 'monthly_and_yearly'
      when v_monthly_changed then 'monthly'
      else 'yearly'
    end;

    update public.plans
    set
      price_monthly_cents = case when v_monthly_changed then v_new_monthly else price_monthly_cents end,
      price_yearly_cents = case when v_yearly_changed then v_new_yearly else price_yearly_cents end,
      updated_at = now()
    where id = v_plan_id;

    insert into public.plan_change_history (
      plan_id, change_type, field,
      previous_monthly_cents, new_monthly_cents,
      previous_yearly_cents, new_yearly_cents,
      percent_applied, rounding_rule, note, batch_id, admin_user_id
    ) values (
      v_plan_id, p_change_type, v_field,
      case when v_monthly_changed then v_current.price_monthly_cents else null end,
      case when v_monthly_changed then v_new_monthly else null end,
      case when v_yearly_changed then v_current.price_yearly_cents else null end,
      case when v_yearly_changed then v_new_yearly else null end,
      p_percent_applied, p_rounding_rule, p_note, v_batch_id, v_admin_id
    );

    perform public.log_audit_event(
      null, 'admin_plan_price_changed', 'plans', null,
      jsonb_build_object(
        'plan_id', v_plan_id, 'change_type', p_change_type, 'field', v_field,
        'previous_monthly_cents', v_current.price_monthly_cents, 'new_monthly_cents', coalesce(v_new_monthly, v_current.price_monthly_cents),
        'previous_yearly_cents', v_current.price_yearly_cents, 'new_yearly_cents', coalesce(v_new_yearly, v_current.price_yearly_cents),
        'percent_applied', p_percent_applied, 'rounding_rule', p_rounding_rule, 'batch_id', v_batch_id
      )
    );

    v_applied := v_applied || jsonb_build_object('plan_id', v_plan_id, 'field', v_field);
  end loop;

  if jsonb_array_length(v_applied) = 0 then
    raise exception 'NO_EFFECTIVE_CHANGES';
  end if;

  return jsonb_build_object('batch_id', v_batch_id, 'applied', v_applied);
end;
$$;

revoke execute on function public.admin_apply_plan_price_changes_system(jsonb, text, numeric, text, text) from public;
grant execute on function public.admin_apply_plan_price_changes_system(jsonb, text, numeric, text, text) to authenticated;
