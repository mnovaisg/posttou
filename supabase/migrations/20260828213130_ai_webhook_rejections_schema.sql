-- Etapa 3A — observabilidade das rejeições de webhook (401), separada da
-- ai_webhook_events (que só guarda entregas VÁLIDAS, já assinadas). Não
-- muda a finalidade de ai_webhook_events; complementa o que ela não podia
-- registrar (a assinatura só é verificada antes do insert nela).
-- Guarda só metadados seguros — nunca assinatura, HMAC key, token, payload
-- bruto ou URL de imagem.
create table public.ai_webhook_rejections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  task_id text,
  reason text not null,
  has_timestamp_header boolean not null default false,
  has_signature_header boolean not null default false,
  has_hmac_secret boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ai_webhook_rejections is
  'Diagnóstico de webhooks de provider de IA rejeitados (ex.: 401 do ai-webhook) — nunca guarda assinatura/secret/token/payload/URL, só metadados de por que foi rejeitado. Limpa automaticamente via cleanup_ai_webhook_rejections().';

alter table public.ai_webhook_rejections enable row level security;
-- Diagnóstico interno, não é dado de usuário/workspace — só service_role
-- (edge functions) escreve e lê; ninguém mais precisa acessar.
revoke all on public.ai_webhook_rejections from anon, authenticated;

create index ai_webhook_rejections_created_at_idx on public.ai_webhook_rejections (created_at);

-- Retenção: 14 dias é suficiente para diagnosticar qualquer problema
-- recorrente sem deixar a tabela crescer indefinidamente (mesmo no pior
-- caso hoje — 100% das gerações rejeitadas — o volume é baixo: 1 linha por
-- tentativa de geração de imagem, não por geração de texto).
create or replace function public.cleanup_ai_webhook_rejections()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_webhook_rejections where created_at < now() - interval '14 days';
$$;

select cron.schedule(
  'cleanup-ai-webhook-rejections-daily',
  '0 4 * * *',
  $$select public.cleanup_ai_webhook_rejections();$$
);
