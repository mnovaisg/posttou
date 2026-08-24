
-- Bug real encontrado no teste de custo Kie.ai: start_pilot_generation()
-- é chamada EXCLUSIVAMENTE por pilot-content-generate/index.ts via
-- `admin.rpc(...)` (client service_role) — nunca via userClient. É o
-- único call site em todo o código (grep confirmado). O caminho é
-- legítimo (é o "Gerar" da UI e o cron semi_auto, ambos passam por essa
-- mesma linha), mas a checagem original exigia
-- current_setting('posttou.system_actor')='pilot_worker' OU
-- has_workspace_role(auth.uid()) — e nada define system_actor antes
-- desta chamada específica, e admin.rpc() nunca carrega auth.uid(). Ou
-- seja: TODO plano aprovado falhava ao tentar iniciar geração pela
-- primeira vez, sempre, desde que este código existe.
--
-- Correção: confiado empiricamente que current_user reflete o role
-- Postgres real da conexão (SET ROLE feito pelo PostgREST/Supabase a
-- partir da JWT/key usada) — 'service_role' quando chamado com a
-- service role key, 'authenticated' quando chamado com JWT de usuário.
-- Isso não pode ser forjado pelo chamador (não é um header/claim lido do
-- payload, é o role autenticado da própria conexão), diferente da GUC
-- posttou.system_actor que dependia do chamador lembrar de setá-la.
--
-- Nenhum bypass genérico: authenticated continua exigindo
-- has_workspace_role normalmente. Só service_role (nossa própria
-- Edge Function, nenhum outro caminho real existe) passa direto.
create or replace function public.start_pilot_generation(p_plan_id uuid)
returns pilot_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.pilot_plans;
begin
  select * into v_plan from public.pilot_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plano não encontrado.';
  end if;
  if current_user <> 'service_role' and not public.has_workspace_role(v_plan.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Sem permissão para iniciar geração deste plano.';
  end if;
  if v_plan.status <> 'approved' then
    raise exception 'Plano precisa estar aprovado para gerar conteúdo (status atual: %).', v_plan.status;
  end if;

  update public.pilot_plans set status = 'generating', updated_at = now() where id = p_plan_id returning * into v_plan;
  return v_plan;
end;
$function$;
