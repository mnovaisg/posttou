# POSTTOU — Arquitetura (Fase 0: Análise)

> "Seu conteúdo. Sua marca. Sua IA."
> Documento de arquitetura antes de qualquer implementação. Nenhuma linha de produto foi escrita ainda — este documento existe para ser aprovado antes da Fase 1.

---

## 1. Arquitetura recomendada

**Padrão geral:** SaaS multi-tenant, monolito modular no início (não microserviços) — mais rápido de construir, mais fácil de manter com equipe pequena, e migrável para serviços separados depois se necessário (ex.: worker de IA/publicação como serviço isolado).

Camadas:

- **Frontend (SPA)** — React + Vite, consumindo API própria via Supabase client + funções de borda (Edge Functions) para lógica sensível.
- **Backend/API** — Supabase (Postgres + Auth + Storage + Edge Functions em Deno) como plataforma primária. Toda regra de negócio sensível (créditos, permissões, tokens de terceiros, publicação) vive em Edge Functions ou Postgres (RLS + functions), nunca só no cliente.
- **Workers assíncronos** — Edge Functions agendadas (cron) para: piloto automático, agendador de publicações, renovação de tokens do Instagram, coleta de métricas.
- **Armazenamento de mídia** — Supabase Storage (buckets privados com URLs assinadas) para imagens/artes geradas e enviadas.
- **IA** — camada de abstração própria (`ai-gateway`) que chama provedores (Anthropic/OpenAI/etc.) — nunca hardcoded num único provedor, para permitir troca/fallback.
- **Integração Instagram/Meta** — Edge Functions dedicadas que encapsulam Graph API (OAuth, publicação, métricas), isolando tokens do frontend.

Por que não Node/Express separado agora: Supabase já cobre Postgres+Auth+RLS+Storage+Functions com boa DX, e é o padrão que você já usa no medcoria — reaproveita conhecimento operacional. Se o produto crescer e precisar de processamento pesado (fila de vídeo, renderização de imagem no servidor), isso pode virar um serviço Node/Deno dedicado depois, sem reescrever o resto.

---

## 2. Stack recomendada

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui (consistência com o que você já domina, mas com tema/identidade visual 100% próprios do POSTTOU — paleta, tipografia e componentes customizados, não reaproveitados do medcoria).
- **Roteamento:** React Router.
- **Estado servidor:** TanStack Query.
- **Formulários:** react-hook-form + zod.
- **Editor visual (canvas):** Fabric.js ou Konva.js (renderização de canvas com texto/imagem/camadas) — decisão detalhada na Fase 5, não agora.
- **Backend:** Supabase (Postgres 15+, Auth, Storage, Edge Functions/Deno, Realtime opcional para colaboração).
- **Fila/agendamento:** Supabase Cron (pg_cron) + Edge Functions.
- **IA:** Anthropic Claude API (texto/legendas/ideias) via camada própria de gateway; geração de imagem via provedor a definir na Fase 4 (ex.: um modelo de imagem via API — a decidir com você, pois tem custo direto).
- **Instagram/Meta:** Meta Graph API oficial (Instagram Graph API para contas Business/Creator conectadas via Facebook Login).
- **Hospedagem frontend:** Vercel (como o medcoria já usa, pelo `vercel.json` do repo atual).
- **Observabilidade:** Supabase Logs + Sentry (frontend/Edge Functions) para erros reais.

---

## 3. Estrutura de pastas (proposta inicial)

```
posttou/
  src/
    app/                    # bootstrap, providers, rotas
    features/
      auth/
      onboarding/
      workspace/
      brand-dna/
      content/               # Meu Conteúdo (lista/calendário/grade)
      ai-studio/              # Criar com IA
      editor/                 # Editor visual
      viral-radar/
      autopilot/
      instagram/
      reports/
      credits/
      billing/
      settings/
      team/
    components/               # componentes de UI próprios do POSTTOU
    lib/
      supabase/
      ai/                    # gateway de IA
      instagram/             # cliente Graph API (tipos/wrappers usados pelo front)
    hooks/
    types/
    styles/
  supabase/
    migrations/
    functions/
      ai-generate/
      instagram-oauth/
      instagram-publish/
      instagram-metrics-sync/
      autopilot-scheduler/
      credits-consume/
    config.toml
  ARCHITECTURE.md
```

Nomeação, componentes e textos serão todos escritos do zero — nenhum arquivo, string ou asset do medcoria ou de referências de mercado será reutilizado.

---

## 4. Arquitetura do banco de dados (visão geral)

Multi-tenant por `workspace_id` em praticamente toda tabela, com **Row Level Security (RLS)** obrigatória no Postgres — isolamento garantido no banco, não só na aplicação.

### 5. Entidades / tabelas principais

**Identidade e workspace**
- `profiles` (1:1 com `auth.users`) — nome, avatar, preferências.
- `workspaces` — empresa/tenant (nome, slug, plano atual, timezone).
- `workspace_members` — (`workspace_id`, `user_id`, `role`: owner/admin/editor/approver/viewer).
- `workspace_invites` — convites pendentes por e-mail/role.

**DNA da Marca**
- `brand_profiles` (1:1 workspace) — segmento, público-alvo, localização, produtos/serviços, diferenciais, problemas resolvidos, tom de voz, objetivos, CTAs padrão, contato.
- `brand_voice_rules` — listas de palavras a usar/evitar, temas a evitar (estrutura flexível, ex. JSONB tipado).
- `brand_assets` — logo, foto de perfil, paleta de cores, fontes (referências para Storage).

**Conteúdo**
- `contents` — item de conteúdo (workspace_id, título, tipo: post/carrossel/reel, status: rascunho/em_revisao/aprovado/agendado/publicado/falhou, formato, criado_por, origem: manual/ia/radar/autopilot).
- `content_versions` — histórico de versões (para "regenerar"/desfazer/comparar).
- `content_pages` — páginas do carrossel (ordem, elementos do canvas em JSON).
- `content_assets` — mídias vinculadas ao conteúdo.
- `content_calendar_slots` — data/hora planejada por conteúdo.

**IA**
- `ai_generations` — log de cada chamada de IA (tipo, prompt/contexto usado, resposta, tokens, custo, workspace, usuário, conteúdo relacionado).

**Instagram**
- `instagram_accounts` — conta conectada (workspace_id, ig_user_id, username, access_token **criptografado**, expiração, status).
- `instagram_publications` — publicação real (content_id, instagram_account_id, ig_media_id, status, erro, publicado_em).
- `instagram_metrics` — métricas coletadas por publicação/dia (alcance, curtidas, comentários, salvos, compartilhamentos).
- `instagram_account_metrics` — métricas de conta (seguidores, crescimento) por dia.

**Radar Viral**
- `radar_sources` — fontes configuradas (hashtags, concorrentes monitorados, categorias do nicho).
- `radar_findings` — itens coletados de fontes reais (com origem/link, nunca inventados).

**Piloto Automático**
- `autopilot_configs` — workspace_id, ativo, exige_aprovação, timezone.
- `autopilot_schedules` — dia da semana + horário + tipo de conteúdo + tema.
- `autopilot_runs` — execução (quando rodou, o que gerou, status).

**Créditos e Planos**
- `plans` — nome, limites (créditos/mês, usuários, workspaces, contas IG, storage, recursos avançados).
- `subscriptions` — workspace_id, plan_id, status, período vigente.
- `credit_ledger` — extrato imutável (workspace_id, data, operação, quantidade, saldo_resultante, referência ao recurso que originou o gasto). Nunca deletar/editar linhas — só inserir.
- `credit_balances` — saldo atual materializado (para leitura rápida), recalculado a partir do ledger.

**Auditoria**
- `audit_logs` — ações sensíveis (mudança de permissão, conexão/desconexão IG, publicação, alteração de plano).

### 6. Relacionamentos (resumo)
- `workspaces` 1:N `workspace_members` N:1 `profiles`.
- `workspaces` 1:1 `brand_profiles`.
- `workspaces` 1:N `contents` 1:N `content_pages`, 1:N `content_versions`.
- `contents` 1:N `instagram_publications` N:1 `instagram_accounts`.
- `workspaces` 1:N `instagram_accounts`.
- `workspaces` 1:1 `autopilot_configs` 1:N `autopilot_schedules` 1:N `autopilot_runs` → gera `contents`.
- `workspaces` 1:N `credit_ledger`; 1:1 `credit_balances`; 1:1 `subscriptions` N:1 `plans`.

---

## 7. Sistema de autenticação

Supabase Auth (e-mail/senha inicialmente, com espaço para OAuth Google depois). JWT do Supabase carrega `user_id`; associação a workspace(s) é resolvida via `workspace_members`, nunca embutida estaticamente no token — permite pertencer a múltiplos workspaces (útil para agências, alinhado à Fase 12).

## 8. Sistema de autorização

- **RLS no Postgres** como camada final de verdade: toda query filtrada por `workspace_id` pertencente ao usuário autenticado, via policies que checam `workspace_members`.
- **Papéis** (`owner`, `admin`, `editor`, `approver`, `viewer`) mapeados para permissões por recurso (ex.: `viewer` não pode publicar; `approver` pode aprovar mas não editar DNA da marca). Policies de RLS + checagem explícita nas Edge Functions (nunca confiar em checagem só no frontend).
- Edge Functions que tocam recursos externos (publicar no IG, gastar créditos) revalidam papel e saldo no servidor antes de agir.

## 9. Arquitetura multi-tenant

- Isolamento por `workspace_id` com RLS em 100% das tabelas de dados de negócio.
- Um usuário pode pertencer a N workspaces (`workspace_members`), com um "workspace ativo" selecionado na sessão do frontend.
- Nenhuma tabela de negócio deve ser consultável sem passar pelo filtro de workspace — testado com policies explícitas, não com `WHERE` manual no app.

## 10. Estratégia para IA

- Camada `ai-gateway` (Edge Function) que recebe: tipo de operação (ideia/legenda/CTA/hashtags/melhorar texto/etc.), contexto do DNA da Marca, e parâmetros do usuário — monta o prompt no servidor (não no cliente, para proteger prompts proprietários e permitir versionar/melhorar centralmente).
- Cada chamada é registrada em `ai_generations` e debita `credit_ledger` de forma atômica (mesma transação/mesma function) — nunca gastar crédito sem log.
- Abstração para múltiplos provedores desde o início (interface própria, não acoplada a um SDK específico), permitindo trocar/combinar modelos por tipo de tarefa.
- Geração de imagem (para posts/carrosséis) é uma decisão de custo a tomar com você na Fase 4 — vou apresentar opções e preços antes de implementar.

## 11. Estratégia para integração com Instagram/Meta

- Uso exclusivo da **Instagram Graph API oficial** (contas Business/Creator conectadas via Facebook Login/Meta Business Login). Sem scraping, sem simulação.
- Fluxo OAuth: usuário autoriza no Meta → recebemos `access_token` de curta duração → trocamos por token de longa duração → armazenamos criptografado em `instagram_accounts`, nunca exposto ao frontend.
- Renovação automática de token antes da expiração (job agendado).
- Publicação: cria container de mídia via Graph API → publica → grava `instagram_publications` com `ig_media_id` real e status real (sucesso/erro real da API).
- **Dependência externa real:** app Meta precisa passar por App Review para permissões de produção (`instagram_content_publish`, `instagram_manage_insights` etc.) — isso é um processo de aprovação da Meta que não está sob nosso controle total; vou deixar isso explícito na Fase 6, incluindo modo de desenvolvimento com contas de teste enquanto o review não sai.

## 12. Estratégia de armazenamento de imagens

- Supabase Storage, buckets privados por tipo (`brand-assets`, `content-media`, `generated-media`), acesso via URLs assinadas de curta duração.
- Uploads validados no servidor (tipo MIME, tamanho, dimensões) antes de aceitar — nunca confiar em validação só do input do frontend.

## 13. Estratégia de créditos

- Ledger append-only (`credit_ledger`) como fonte da verdade; saldo materializado em `credit_balances` recalculado via trigger/function a cada inserção.
- Débito de crédito e execução da operação de IA/publicação acontecem na mesma transação/função no servidor — se a operação falhar, o crédito não é debitado (ou é estornado com registro explícito, nunca silenciosamente).
- Histórico visível ao usuário: data, operação, quantidade, saldo resultante (exatamente como pedido).

## 14. Estratégia de planos

- Tabela `plans` parametrizável (sem preços definitivos agora, só limites estruturais): créditos/mês, nº usuários, nº workspaces, nº contas Instagram, nº publicações, storage, flags de recursos avançados (radar, piloto automático, etc.).
- Enforcement de limites feito no servidor (Edge Functions/RLS/checagens explícitas), nunca só escondendo botão no frontend.

## 15. Estratégia de publicação/agendamento

- `content_calendar_slots` define quando publicar; um job agendado (pg_cron + Edge Function) varre conteúdos com status "agendado" cujo horário chegou e dispara a publicação real via Graph API, atualizando status para "publicado" ou "falhou" com mensagem de erro real.
- Piloto automático gera o conteúdo (rascunho ou já agendado, dependendo de "exigir aprovação") e reaproveita o mesmo pipeline de agendamento/publicação — sem caminho paralelo duplicado.

## 16. Riscos técnicos

- **Aprovação do app na Meta** pode atrasar publicação/agendamento reais em produção — maior risco externo do roadmap.
- **Custo de IA** (texto e principalmente imagem) precisa de controle rígido de créditos desde o dia 1, senão o modelo de negócio quebra.
- **Editor visual** (canvas) é a peça de maior complexidade de frontend — merece tempo dedicado na Fase 5, não deve ser apressado.
- **Renovação de tokens do Instagram** falhando silenciosamente é um risco de "publicação fantasma prometida" — precisa de alertas/monitoramento desde a Fase 6.
- **Radar Viral** depende de fontes de dados reais (APIs de terceiros ou dados via Graph API de contas conectadas) — se não houver fonte confiável disponível, a Fase 8 deve declarar isso explicitamente em vez de inventar dados.

## 17. Dependências externas

- Meta for Developers (app + App Review) para Instagram Graph API.
- Provedor de IA para texto (Anthropic Claude, via API).
- Provedor de IA para imagem (a definir — Fase 4).
- Supabase (Postgres/Auth/Storage/Edge Functions).
- Vercel (hospedagem frontend).
- Possível fonte de dados de tendências/concorrência para Radar Viral (a definir — Fase 8).
- Sentry (opcional, monitoramento de erros).

## 18. Variáveis de ambiente necessárias (previstas)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # somente em Edge Functions/servidor
ANTHROPIC_API_KEY=                # somente em Edge Functions
AI_IMAGE_PROVIDER_API_KEY=        # a definir na Fase 4
META_APP_ID=
META_APP_SECRET=                  # somente em Edge Functions
META_REDIRECT_URI=
INSTAGRAM_TOKEN_ENCRYPTION_KEY=   # criptografia de tokens em repouso
SENTRY_DSN=                       # opcional
```

## 19. Roadmap de desenvolvimento

Segue exatamente as 13 fases definidas por você, sem pular etapas:

1. Fundação (arquitetura, auth, banco, workspace, dashboard, identidade visual inicial, navegação, permissões)
2. DNA da Marca
3. Meu Conteúdo + Calendário
4. Criação de conteúdo com IA
5. Editor visual
6. Integração Instagram
7. Agendamento e publicação
8. Radar Viral
9. Piloto Automático
10. Relatórios e analytics
11. Planos, créditos e faturamento
12. Equipe, permissões e recursos avançados
13. Polimento, segurança, performance e lançamento

Cada fase só é considerada concluída quando funcional de ponta a ponta (sem telas falsas, sem dados fake, sem integração simulada), conforme seu princípio fundamental.

---

**Local do projeto:** `/Users/marcelonovais/Documents/DEV/apps/posttou` (repositório novo, separado do medcoria).

**Próximo passo:** aguardando sua aprovação desta arquitetura para iniciar a Fase 1.
