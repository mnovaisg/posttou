-- Bug real encontrado na auditoria: a versão anterior de
-- _admin_org_contracted_cents não filtrava `kind`, então uma cobrança
-- AVULSA de upgrade (kind='upgrade', valor de pró-rata, não
-- recorrência) podia ser lida como "valor contratado" se por
-- coincidência o plan_id dela batesse com o plano atual (ex.: cliente
-- que fez upgrade e depois voltou pro mesmo plano). Provado com dado
-- real: org 0ac9fef9-... tinha uma cobrança de upgrade paga de R$199
-- gravada com plan_id='essencial' (porque o webhook grava a cobrança
-- de upgrade com o plano ANTIGO, antes da troca ser aplicada) — e
-- essencial é o plan_id atual dela, então a função devolvia R$199 pro
-- plano Essencial (preço real R$99).
--
-- Regras que esta função implementa (auditoria aprovada em 04/09):
--   1. Só `kind = 'recurring'` conta como evidência de recorrência —
--      cobrança avulsa/pró-rata (kind='upgrade') NUNCA representa o
--      valor recorrente contratado, mesmo que paga e mesmo que o
--      plan_id bata por coincidência com o plano atual.
--   2. Cupom `first_payment` nunca reduz o MRR permanente — uma
--      cobrança paga com esse tipo de cupom é ignorada como evidência
--      de recorrência, mesmo sendo a mais recente.
--   3. Cupom `recurring` PODE reduzir o valor recorrente, enquanto
--      realmente aplicável — não é excluído, o valor final da
--      cobrança (já líquido do desconto) é usado normalmente.
--   4. Fallback pro preço vigente (_admin_org_cycle_charge_cents,
--      que já respeita cupom recorrente ativo) só acontece quando não
--      existe nenhuma cobrança real que satisfaça as regras acima —
--      nunca inventa um valor "no meio do caminho".
create or replace function public._admin_org_contracted_cents(p_plan_id text, p_interval billing_interval, p_organization_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select bc.final_amount_cents
     from public.billing_charges bc
     left join public.coupon_redemptions cr on cr.id = bc.coupon_redemption_id
     left join public.coupons c on c.id = cr.coupon_id
     where bc.organization_id = p_organization_id and bc.plan_id = p_plan_id and bc.billing_interval = p_interval
       and bc.status = 'paid' and bc.kind = 'recurring'
       and c.duration is distinct from 'first_payment'
     order by coalesce(bc.paid_at, bc.due_date) desc limit 1),
    public._admin_org_cycle_charge_cents(p_plan_id, p_interval, p_organization_id)
  );
$$;
