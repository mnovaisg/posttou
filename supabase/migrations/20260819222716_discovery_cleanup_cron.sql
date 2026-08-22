-- Limpeza real dos dados da Discovery pública: agenda
-- cleanup_expired_discovery_data() para rodar de hora em hora via
-- pg_cron, em vez de depender só de expires_at (que sozinho não apaga
-- nada).
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-discovery-data-hourly',
  '0 * * * *',
  $$select public.cleanup_expired_discovery_data();$$
);
