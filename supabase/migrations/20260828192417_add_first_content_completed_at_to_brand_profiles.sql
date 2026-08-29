alter table public.brand_profiles
  add column first_content_completed_at timestamptz;

-- Backfill: workspaces que já concluíram o DNA antes desta etapa nunca
-- devem cair no fluxo "Primeiro Conteúdo Automático" ao simplesmente
-- reabrir /dna-da-marca — só workspaces que completarem o DNA a partir de
-- agora começam com esta coluna nula (fluxo pendente).
update public.brand_profiles
set first_content_completed_at = onboarding_completed_at
where onboarding_completed_at is not null
  and first_content_completed_at is null;

comment on column public.brand_profiles.first_content_completed_at is
  'Etapa 3 — marca quando o fluxo "Primeiro Conteúdo Automático" foi concluído (estilo aceito ou usuário optou por outra direção). Enquanto for null e onboarding_completed_at estiver preenchido, /dna-da-marca deve retomar o FirstContentFlow (recuperável após reload/fechamento).';
