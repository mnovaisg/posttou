
-- Bug real encontrado ao testar Bloco 10 ao vivo: CREATE OR REPLACE com um
-- parâmetro novo (p_always_require_approval) criou um OVERLOAD novo em vez
-- de substituir a função — a assinatura mudou, então Postgres tratou como
-- função distinta, sem GRANTs (nem para service_role). "Salvar configurações"
-- retornava 403 silenciosamente. Remove a versão antiga (14 params, sem o
-- novo campo) e concede EXECUTE explícito na versão nova.
drop function if exists public.upsert_pilot_settings(
  uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamp with time zone, uuid, bigint, jsonb, boolean
);

grant execute on function public.upsert_pilot_settings(
  uuid, public.pilot_mode, integer, integer, integer[], jsonb, public.content_type[], jsonb, boolean, integer, numeric, text, text, timestamp with time zone, uuid, bigint, jsonb, boolean, boolean
) to authenticated;
