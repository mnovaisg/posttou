
-- Hotfix (pré-existente ao Bloco 9, achado testando "Radar existente
-- continua funcionando"): radar-worker processava TODAS as combinações
-- workspace×cluster numa única invocação síncrona (até 50×5=250
-- chamadas sequenciais à Kie.ai, ~10-15s cada) — estourava o limite de
-- recursos da Edge Function. Última execução bem-sucedida: 25/08 16h;
-- todas desde então ficaram presas em 'running' para sempre.
--
-- Correção: fila de trabalho explícita — cada (workspace, cluster) vira
-- 1 job. Uma invocação do worker faz: (1) reconcilia runs/jobs
-- travados, (2) coleta+clusteriza (como antes, cache-gated, barato),
-- (3) ENFILEIRA pares pendentes (sem IA), (4) reivindica e processa só
-- um LOTE PEQUENO (claim atômico via FOR UPDATE SKIP LOCKED — nunca
-- duas invocações processam o mesmo job). Cron passa de 4h para 2min,
-- cada tick drena um pedaço da fila até esvaziar.
create table public.radar_match_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cluster_id uuid not null references public.radar_clusters(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts int not null default 0,
  last_error text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index radar_match_jobs_unique_pair on public.radar_match_jobs (workspace_id, cluster_id);
create index idx_radar_match_jobs_status on public.radar_match_jobs (status);
-- Claim atômico eficiente: só olha pending, ordenado por criação.
create index idx_radar_match_jobs_pending_queue on public.radar_match_jobs (created_at) where status = 'pending';

comment on table public.radar_match_jobs is
  'Hotfix pós-Bloco 9: fila de trabalho do radar-worker (1 job por par workspace×cluster a avaliar via IA). Substitui o processamento síncrono de até 250 pares numa única invocação, que estourava o limite de recursos da Edge Function. status=processing com lease_expires_at vencido é considerado travado e reaberto (retry) pela própria próxima invocação — nunca fica preso para sempre.';

-- Apenas service_role escreve/lê (mesmo padrão de radar_signals/
-- radar_clusters — dado operacional interno, não workspace-facing).
alter table public.radar_match_jobs enable row level security;

-- Reconciliação (não é gambiarra: registra motivo, preserva histórico —
-- pedido explícito). Runs presas há mais de 10 minutos em 'running' são
-- marcadas 'failed' com o motivo — nunca apagadas.
update public.radar_runs
set status = 'failed',
    finished_at = now(),
    error_message = 'Reconciliado automaticamente: execução travada em "running" além do tempo esperado (provável WORKER_RESOURCE_LIMIT antes do hotfix de fila de trabalho).'
where status = 'running'
  and started_at < now() - interval '10 minutes';
