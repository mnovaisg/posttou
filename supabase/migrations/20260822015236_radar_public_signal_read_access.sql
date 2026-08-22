-- radar_signals/radar_clusters/radar_cluster_signals são derivados de
-- fontes PÚBLICAS (YouTube trending) e não carregam nenhum dado privado
-- de workspace — diferente de radar_opportunities (que sim é
-- workspace-scoped e continua exigindo is_workspace_member). Sem SELECT
-- para authenticated aqui, o embed `radar_opportunities.select('*,
-- radar_clusters(*)')` do PostgREST retornaria null silenciosamente
-- (RLS bloqueando a tabela relacionada), quebrando a explicação/evidência
-- do score na UI. Nunca há GRANT de insert/update/delete — escrita
-- continua exclusiva do worker (service_role) via as tabelas diretamente.
create policy "radar_clusters_select_authenticated" on public.radar_clusters for select to authenticated using (true);
create policy "radar_signals_select_authenticated" on public.radar_signals for select to authenticated using (true);
create policy "radar_cluster_signals_select_authenticated" on public.radar_cluster_signals for select to authenticated using (true);

grant select on public.radar_clusters, public.radar_signals, public.radar_cluster_signals to authenticated;
