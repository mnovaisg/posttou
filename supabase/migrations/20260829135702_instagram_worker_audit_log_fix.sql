-- Etapa 4B — bug real encontrado na auditoria: log_audit_event() exige
-- is_workspace_member(auth.uid()) a menos que posttou.system_actor esteja
-- setado como 'instagram_publish_worker' NA MESMA TRANSAÇÃO. As RPCs
-- claim/complete/fail_instagram_publication setam isso internamente
-- (perform set_config(...) como primeira linha do próprio corpo
-- plpgsql), então os logs que elas mesmas geram sempre funcionaram. Mas
-- instagram-token-refresh e os pontos do instagram-publish-worker que
-- chamam log_audit_event DIRETAMENTE (fora dessas RPCs) rodam com
-- service_role puro (auth.uid() é null) — a chamada falha com
-- "Sem permissão para registrar auditoria neste workspace", e como
-- admin.rpc(...) do supabase-js NUNCA rejeita a Promise por causa de um
-- erro do Postgres (só popula response.error, que ninguém checava aqui),
-- a falha ficou 100% silenciosa desde a Fase 7. Confirmado: zero linhas
-- históricas para instagram_reauthorization_required,
-- instagram_token_refreshed e instagram_publish_reconciliation_needed,
-- apesar de código correto chamando log_audit_event nesses pontos.
--
-- Esta RPC é o mesmo padrão já usado por claim/complete/fail_instagram_publication,
-- só que dedicada a ser chamada DIRETO das Edge Functions (não de dentro
-- de outra função plpgsql) nos pontos onde não existe uma RPC de negócio
-- própria para "emprestar" o bypass.
create or replace function public.log_instagram_worker_audit_event(
  p_workspace_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform set_config('posttou.system_actor', 'instagram_publish_worker', true);
  return public.log_audit_event(p_workspace_id, p_action, p_resource_type, p_resource_id, p_metadata);
end;
$function$;

comment on function public.log_instagram_worker_audit_event(uuid, text, text, uuid, jsonb) is 'Etapa 4B — wrapper de log_audit_event() para chamadas DIRETAS das Edge Functions de background do domínio Instagram (instagram-token-refresh, instagram-publish-worker) que não passam por claim/complete/fail_instagram_publication. Nunca chamada por auth/anon — só service_role.';

revoke all on function public.log_instagram_worker_audit_event(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.log_instagram_worker_audit_event(uuid, text, text, uuid, jsonb) to service_role;
