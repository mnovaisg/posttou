-- Gate server-side que NÃO pode ser burlado por chamada direta à API:
-- roda como trigger BEFORE INSERT em contents (RLS + trigger, nunca
-- confiar em checagem feita só no frontend). Bloqueia a criação quando a
-- assinatura está expirada/cancelada, e durante 'active'/'past_due'
-- (dentro da tolerância) também impõe o teto mensal de franquia via
-- pg_advisory_xact_lock por organization — mesma proteção de concorrência
-- já usada em outros pontos do produto (ex.: pilot_claim_* usa FOR UPDATE
-- SKIP LOCKED; aqui usamos advisory lock pois o "recurso" disputado é um
-- contador agregado, não uma linha específica).
create or replace function public.enforce_content_franchise_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_effective_status public.subscription_status;
  v_period record;
  v_used integer;
begin
  select organization_id into v_org_id from public.workspaces where id = new.workspace_id;
  if v_org_id is null then
    raise exception 'WORKSPACE_WITHOUT_ORGANIZATION';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_org_id::text));

  select * into v_sub from public.subscriptions where organization_id = v_org_id;
  if v_sub is null then
    raise exception 'NO_SUBSCRIPTION_FOUND';
  end if;

  v_effective_status := public.get_effective_subscription_status(v_sub);

  if v_effective_status in ('expired', 'cancelled') then
    raise exception 'SUBSCRIPTION_%', upper(v_effective_status::text);
  end if;

  -- Trial usa exclusivamente o teto de créditos internos (50), não a
  -- franquia de conteúdos do plano — decisão explícita da Fase 14B.
  if v_effective_status <> 'trialing' then
    select * into v_plan from public.plans where id = v_sub.plan_id;
    select * into v_period from public.get_franchise_period(v_sub);

    select count(*) into v_used from public.content_franchise_ledger
    where organization_id = v_org_id and period_start = v_period.period_start;

    if v_used >= v_plan.monthly_content_allowance then
      raise exception 'FRANCHISE_LIMIT_REACHED';
    end if;

    insert into public.content_franchise_ledger (organization_id, workspace_id, content_id, period_start, period_end)
    values (v_org_id, new.workspace_id, new.id, v_period.period_start, v_period.period_end)
    on conflict (content_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger content_franchise_gate
  before insert on public.contents
  for each row execute function public.enforce_content_franchise_gate();
