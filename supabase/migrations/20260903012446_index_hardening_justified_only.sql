
-- Bloco 12.2 — item 10. Não criamos índice pra cada uma das ~69 FKs
-- apontadas pelo advisor — só as que têm evidência real e observável de
-- query/join/worker/RLS neste código (auditado diretamente nesta sessão).
-- As demais ficam registradas como backlog no relatório final, sem
-- evidência suficiente para justificar o índice agora.

-- 1) Índice duplicado confirmado (definição idêntica): instagram_accounts
-- tinha DUAS unique indexes cobrindo exatamente (workspace_id, ig_user_id).
-- A que NÃO tem constraint de unicidade atrelada é a redundante — dropada.
-- A outra (instagram_accounts_workspace_id_ig_user_id_key) sustenta um
-- UNIQUE CONSTRAINT real e fica intacta.
drop index if exists public.instagram_accounts_workspace_ig_user_key;

-- 2) Billing — get_workspace_entitlements/check_subscription_entitlement
-- rodam em toda carga da tela de billing e fazem join em plans por
-- plan_id/pending_plan_id.
create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_pending_plan_id_idx on public.subscriptions (pending_plan_id) where pending_plan_id is not null;

-- 3) Radar — RadarPage.tsx faz join direto opportunities->clusters
-- (radar_clusters(...)) em toda carga da tela; radar-worker (cron a cada
-- 2min) processa radar_match_jobs por cluster_id.
create index if not exists radar_opportunities_cluster_id_idx on public.radar_opportunities (cluster_id);
create index if not exists radar_match_jobs_cluster_id_idx on public.radar_match_jobs (cluster_id);

-- 4) instagram-publish-worker roda a cada 1 minuto (cron ativo) e junta
-- publications com sua content_version.
create index if not exists instagram_publications_content_version_id_idx on public.instagram_publications (content_version_id);

-- 5) Piloto — pilot-cron-dispatcher/pilot-content-generate juntam
-- pilot_plan_items com o content gerado.
create index if not exists pilot_plan_items_content_id_idx on public.pilot_plan_items (content_id) where content_id is not null;

-- 6) Cupons — reserve_coupon_redemption_system conta resgates por
-- organization_id dentro do coupon_id (RPC real, testada extensivamente
-- nos Blocos 11/11.1).
create index if not exists coupon_redemptions_organization_id_idx on public.coupon_redemptions (organization_id);

-- 7) Equipe — list_organization_invites filtra por workspace_id
-- (RPC real, usada pela tela de Equipe).
create index if not exists organization_invites_workspace_id_idx on public.organization_invites (workspace_id);

-- 8) Claim do fluxo de Descoberta — useDiscoveryClaimOnLogin checa
-- pre_onboarding_sessions por claimed_workspace_id em todo login de quem
-- veio pelo funil da Landing.
create index if not exists pre_onboarding_sessions_claimed_workspace_id_idx on public.pre_onboarding_sessions (claimed_workspace_id) where claimed_workspace_id is not null;
