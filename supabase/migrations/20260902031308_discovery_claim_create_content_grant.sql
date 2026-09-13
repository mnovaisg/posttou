
-- A função nova não herdava o grant de EXECUTE para service_role
-- (diferente de pilot_create_content, criada antes de alguma mudança
-- nos privilégios padrão do schema) — sem isso, a Edge Function do
-- claim (que roda com a service role key) recebia 42501 permission
-- denied ao chamar a RPC, e as 3 sugestões nunca eram promovidas.
grant execute on function public.discovery_claim_create_content(uuid, public.content_type, public.content_format, text, text, uuid, uuid, int, int) to service_role, authenticated;
