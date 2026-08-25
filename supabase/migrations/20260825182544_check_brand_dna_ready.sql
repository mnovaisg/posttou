
-- Ajuste pré-beta — jornada guiada. Guard server-side mínimo: nenhuma
-- geração de conteúdo por IA deve rodar sem o Brand DNA mínimo (mesmo
-- critério já usado por get_onboarding_state para brand_dna_done —
-- única fonte de verdade, não duplicada). Nunca depende só do frontend
-- (auditoria encontrou 4 caminhos reais de geração sem nenhum guard).
-- Mesmo padrão de check_subscription_entitlement: retorna
-- {allowed, reason}, chamado pelo client admin (service_role) de cada
-- Edge Function de geração.
create or replace function public.check_brand_dna_ready(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when exists (
      select 1 from public.brand_profiles
      where workspace_id = p_workspace_id
        and company_name is not null
        and description is not null
        and onboarding_completed_at is not null
    )
    then jsonb_build_object('allowed', true)
    else jsonb_build_object('allowed', false, 'reason', 'BRAND_DNA_REQUIRED')
  end;
$$;

grant execute on function public.check_brand_dna_ready(uuid) to authenticated, service_role;
revoke execute on function public.check_brand_dna_ready(uuid) from anon;
