
-- Bug de segurança introduzido no grant anterior: authenticated não
-- deveria ter EXECUTE direto nesta função — ela não checa membership do
-- workspace (assume que quem chama, no caso a Edge Function do claim,
-- já validou is_workspace_member antes). Com EXECUTE liberado para
-- authenticated, qualquer usuário logado poderia chamar a RPC via
-- PostgREST e inserir conteúdo em workspace_id arbitrário. Só
-- service_role (chamada exclusivamente pela Edge Function) deve poder
-- executá-la.
revoke execute on function public.discovery_claim_create_content(uuid, public.content_type, public.content_format, text, text, uuid, uuid, int, int) from authenticated;
