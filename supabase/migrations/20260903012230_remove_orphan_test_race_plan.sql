
-- Bloco 12.2 — item 11: plano de teste "Test Race" (R$0, is_active=false),
-- confirmado órfão: 0 subscriptions.plan_id, 0 subscriptions.pending_plan_id,
-- 0 coupon_redemptions.plan_id, 0 referências em coupons.eligible_plan_ids,
-- 0 referências em código frontend/backend. Seguro remover.
delete from public.plans where id = 'test_race_plan';
