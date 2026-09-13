
insert into coupons (code, discount_type, discount_value, duration, active, expires_at) values
  ('EXPIRADO10', 'percentage', 10, 'recurring', true, now() - interval '1 day'),
  ('FUTURO10', 'percentage', 10, 'recurring', true, null),
  ('SOAGENCIA', 'fixed', 50, 'first_payment', true, null),
  ('SOANUAL', 'percentage', 20, 'recurring', true, null),
  ('INATIVO10', 'percentage', 10, 'recurring', false, null);
update coupons set starts_at = now() + interval '7 days' where code = 'FUTURO10';
update coupons set eligible_plan_ids = array['agencia'] where code = 'SOAGENCIA';
update coupons set eligible_billing_intervals = array['yearly']::billing_interval[] where code = 'SOANUAL';
