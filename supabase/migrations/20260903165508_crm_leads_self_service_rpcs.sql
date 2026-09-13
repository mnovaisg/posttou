-- Autoatendimento — o próprio usuário grava seu consentimento de
-- marketing (nunca lê/grava o de outra pessoa: user_id sempre auth.uid(),
-- nunca um parâmetro). Append-only (aprovado item 4/9): nunca
-- sobrescreve, sempre insere uma nova linha; o estado atual é a mais
-- recente por (user_id, channel).
create or replace function public.set_my_marketing_consent_system(p_channel text, p_opted_in boolean, p_source text default 'settings_page')
returns public.marketing_consents
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.marketing_consents;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'INVALID_CHANNEL';
  end if;

  insert into public.marketing_consents (user_id, channel, opted_in, source)
  values (auth.uid(), p_channel, p_opted_in, coalesce(nullif(trim(p_source), ''), 'settings_page'))
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.set_my_marketing_consent_system(text, boolean, text) from public;
grant execute on function public.set_my_marketing_consent_system(text, boolean, text) to authenticated;

create or replace function public.get_my_marketing_consent_system()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'email', (select mc.opted_in from public.marketing_consents mc where mc.user_id = auth.uid() and mc.channel = 'email' order by mc.changed_at desc limit 1),
    'whatsapp', (select mc.opted_in from public.marketing_consents mc where mc.user_id = auth.uid() and mc.channel = 'whatsapp' order by mc.changed_at desc limit 1)
  )
$$;
revoke execute on function public.get_my_marketing_consent_system() from public;
grant execute on function public.get_my_marketing_consent_system() to authenticated;

-- Atribuição de primeiro toque — só quem já é membro da organização
-- pode gravar (is_organization_member, já existente), e só grava se
-- ainda não existir nenhuma linha pra essa organização (ON CONFLICT DO
-- NOTHING) — uma visita/cadastro futuro nunca sobrescreve a primeira
-- atribuição real (aprovado item 5).
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
  v_inserted boolean := false;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'NOT_ORGANIZATION_MEMBER';
  end if;

  insert into public.lead_attribution (organization_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, coupon_code_at_signup)
  values (p_organization_id, nullif(p_utm_source,''), nullif(p_utm_medium,''), nullif(p_utm_campaign,''), nullif(p_utm_content,''), nullif(p_utm_term,''), nullif(p_coupon_code,''))
  on conflict (organization_id) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object('captured', v_inserted > 0);
end;
$$;
revoke execute on function public.claim_lead_attribution_system(uuid, text, text, text, text, text, text) from public;
grant execute on function public.claim_lead_attribution_system(uuid, text, text, text, text, text, text) to authenticated;
