# Status do Business Discovery (@ automático)

Documentado pela primeira vez na Fase 12 (2026-08-23), ainda pendente em
2026-08-25 durante o ajuste da jornada guiada de onboarding.

## Situação atual

O caminho **@Instagram → análise automática → DNA sugerido** (arquitetura
definitiva do onboarding, ver [`KnowYourBrandFlow.tsx`](../src/features/brand-dna/KnowYourBrandFlow.tsx))
está **bloqueado** porque 4 secrets de Edge Function não estão
configurados no projeto Supabase `japufmcbhvusgcbhhhby`:

- `INSTAGRAM_DISCOVERY_APP_ID`
- `INSTAGRAM_DISCOVERY_CALLER_ACCESS_TOKEN`
- `INSTAGRAM_DISCOVERY_CALLER_IG_USER_ID`
- `DISCOVERY_IP_HASH_SECRET`

Confirmado por checagem direta (presença, não valor) em 2026-08-25.

## O que falta para desbloquear

Os 3 primeiros dependem da Meta, não são gerados localmente:

1. Um App da Meta com Instagram Graph API + Business Discovery habilitado
   (`INSTAGRAM_DISCOVERY_APP_ID`).
2. Uma conta profissional (Business/Creator) do Instagram, de propriedade
   do próprio POSTTOU, conectada via Meta Business Suite, cujo token de
   acesso funciona como "chamador" para consultar `@`s alheios
   publicamente (`INSTAGRAM_DISCOVERY_CALLER_ACCESS_TOKEN` +
   `INSTAGRAM_DISCOVERY_CALLER_IG_USER_ID`).

O quarto (`DISCOVERY_IP_HASH_SECRET`) é só um segredo aleatório
interno para rate-limiting por IP — não depende da Meta, foi gerado em
2026-08-25 e entregue ao usuário para configurar manualmente no painel
(nunca commitado, nunca logado). Configurá-lo sozinho **não** desbloqueia
o Discovery — os 3 secrets da Meta continuam faltando.

## Comportamento enquanto bloqueado

`instagram-discovery-public-start` retorna `501 not_configured` de forma
explícita — nunca simula um resultado, nunca faz scraping. O frontend
(`KnowYourBrandFlow.tsx`) intercepta esse estado e degrada silenciosamente
para o fallback por descrição textual (`brand-dna-assist` → AI Gateway) —
**o usuário final nunca vê "not_configured", "501", nomes de secret, nem
qualquer menção a Meta API ou Business Discovery.**

## Quando for configurado

Nenhuma mudança de código será necessária — `KnowYourBrandFlow.tsx` já
tenta o caminho `@` primeiro em toda execução; assim que
`instagram-discovery-public-start` parar de retornar `not_configured`, o
fluxo real (Business Discovery → AI Gateway → resumo → aprovação) passa a
funcionar automaticamente, na mesma tela, no mesmo onboarding.
