-- Etapa 4A — retorno contextual do OAuth do Instagram. O destino pós-
-- callback nunca pode vir de uma URL fornecida pelo cliente (open
-- redirect) — por isso é um enum fechado (allowlist server-side),
-- gravado no MESMO state CSRF já existente (instagram_oauth_states),
-- nunca em querystring/cliente. O callback (instagram-oauth-callback)
-- é o único lugar que converte este valor numa rota interna conhecida,
-- via um mapa fixo no código, nunca por concatenação.
create type public.instagram_oauth_return_to as enum ('onboarding', 'settings', 'dashboard');

alter table public.instagram_oauth_states
  add column return_to public.instagram_oauth_return_to not null default 'settings';

comment on column public.instagram_oauth_states.return_to is 'Destino interno CONHECIDO (allowlist fechada) para onde o callback deve redirecionar após concluir/cancelar o OAuth. settings preserva o comportamento anterior a esta migration (Configurações). Nunca uma URL — só o enum, convertido para rota fixa dentro de instagram-oauth-callback.';
