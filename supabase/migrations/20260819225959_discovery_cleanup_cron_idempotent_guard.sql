-- cron.schedule(jobname, ...) já é idempotente por nome a partir do
-- pg_cron 1.4 (reaplicar atualiza o job existente em vez de duplicar
-- — confirmado: só existe 1 job com este nome mesmo após reaplicar a
-- migration anterior). Este guard explícito é defesa extra: garante
-- que nenhuma versão futura do pg_cron ou reexecução manual crie um
-- segundo job com o mesmo nome.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup-discovery-data-hourly') then
    perform cron.schedule(
      'cleanup-discovery-data-hourly',
      '0 * * * *',
      $cron$select public.cleanup_expired_discovery_data();$cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'cleanup-discovery-data-hourly'),
      schedule => '0 * * * *',
      command => 'select public.cleanup_expired_discovery_data();'
    );
  end if;
end;
$$;
