-- Bug real: CREATE OR REPLACE com um parâmetro novo criou um SEGUNDO
-- overload (uuid,text,billing_interval,bigint) em vez de substituir o
-- original (uuid,text,billing_interval) — Postgres só reaproveita o OID
-- quando a assinatura é idêntica; um parâmetro a mais, mesmo com
-- default, conta como função nova pra fins de overload. O overload
-- antigo nunca foi dropado e ficou com os grants antigos; o novo nunca
-- recebeu GRANT nenhum, causando "permission denied" em produção assim
-- que o frontend passou a chamar com 4 argumentos nomeados.
drop function if exists public.request_plan_change(uuid, text, billing_interval);

revoke execute on function public.request_plan_change(uuid, text, billing_interval, bigint) from public;
grant execute on function public.request_plan_change(uuid, text, billing_interval, bigint) to authenticated;
