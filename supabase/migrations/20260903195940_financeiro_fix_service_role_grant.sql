-- Bug real encontrado no teste do backfill: service_role nunca tinha
-- GRANT EXECUTE explícito (só authenticated) — o REVOKE FROM PUBLIC
-- bloqueava a própria chamada do webhook/backfill antes de chegar na
-- checagem interna de autorização.
grant execute on function public.upsert_billing_charge_system(uuid, uuid, text, text, text, billing_interval, text, bigint, bigint, bigint, uuid, date, timestamptz, text, text, text) to service_role;
