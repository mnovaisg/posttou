-- Destaque de cupom na Landing — reaproveita coupons/preview_coupon
-- integralmente (nenhuma tabela paralela). Só 2 colunas novas: qual
-- cupom mostrar e um rótulo opcional; percentual/valor/validade/
-- planos/ciclos/duração continuam sendo as regras reais do cupom, nunca
-- duplicadas aqui.
alter table public.coupons add column if not exists show_on_landing boolean not null default false;
alter table public.coupons add column if not exists landing_label text;

-- No máximo 1 cupom em destaque por vez — garantido no banco, não só na UI.
create unique index if not exists coupons_one_landing_featured_idx on public.coupons (show_on_landing) where show_on_landing = true;

comment on column public.coupons.show_on_landing is 'Se true, este cupom aparece em destaque nos cards de planos da Landing pública. No máximo 1 por vez (índice único parcial).';
comment on column public.coupons.landing_label is 'Rótulo opcional exibido no selo da Landing (ex.: "Oferta de boas-vindas"). Nunca substitui o desconto/duração reais do cupom.';

-- Leitura pública (Landing, pré-cadastro) — só existência + escopo do
-- cupom em destaque, nunca o cálculo de desconto (isso continua sendo
-- public_preview_coupon, já existente, por plano/ciclo real). Desaparece
-- sozinho quando inativo/expirado/fora do período/esgotado, porque a
-- condição já filtra tudo isso na própria query.
create or replace function public.public_featured_coupon_system()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'code', c.code,
    'landing_label', c.landing_label,
    'eligible_plan_ids', c.eligible_plan_ids,
    'eligible_billing_intervals', c.eligible_billing_intervals
  )
  from public.coupons c
  where c.show_on_landing = true
    and c.active = true
    and (c.starts_at is null or now() >= c.starts_at)
    and (c.expires_at is null or now() <= c.expires_at)
    and (
      c.max_redemptions is null
      or (select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved', 'applied')) < c.max_redemptions
    )
  limit 1
$$;
revoke execute on function public.public_featured_coupon_system() from public;
grant execute on function public.public_featured_coupon_system() to anon, authenticated;

-- Admin: liga/desliga o destaque de um cupom. Sempre desliga qualquer
-- outro primeiro (o índice único parcial bloquearia 2 ativos ao mesmo
-- tempo de qualquer forma — isso só evita o erro e torna a troca atômica).
create or replace function public.admin_set_coupon_landing_featured_system(p_coupon_id uuid, p_featured boolean, p_label text default null)
returns public.coupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.coupons;
begin
  perform public._require_platform_admin();

  if not exists (select 1 from public.coupons where id = p_coupon_id) then
    raise exception 'COUPON_NOT_FOUND';
  end if;

  if p_featured then
    update public.coupons set show_on_landing = false, landing_label = null where show_on_landing = true and id <> p_coupon_id;
    update public.coupons set show_on_landing = true, landing_label = nullif(trim(coalesce(p_label, '')), '') where id = p_coupon_id
      returning * into v_row;
  else
    update public.coupons set show_on_landing = false, landing_label = null where id = p_coupon_id
      returning * into v_row;
  end if;

  insert into public.audit_logs (workspace_id, user_id, action, resource_type, resource_id, metadata)
  values (null, auth.uid(), 'admin_coupon_landing_featured_set', 'coupons', p_coupon_id, jsonb_build_object('featured', p_featured, 'label', p_label));

  return v_row;
end;
$$;
revoke execute on function public.admin_set_coupon_landing_featured_system(uuid, boolean, text) from public;
grant execute on function public.admin_set_coupon_landing_featured_system(uuid, boolean, text) to authenticated;
