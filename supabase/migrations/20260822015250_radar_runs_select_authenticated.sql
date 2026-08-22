-- Permite à UI mostrar quando o Radar rodou pela última vez / se algum
-- provider falhou (empty state honesto, item 45 da aprovação) — dado
-- operacional sem informação sensível de workspace.
create policy "radar_runs_select_authenticated" on public.radar_runs for select to authenticated using (true);
grant select on public.radar_runs to authenticated;
