# Migrations — processo obrigatório (Fase 14A)

## Regra única

```
migration nasce no repo → é versionada (commit) → só então é aplicada (apply_migration/CLI)
```

**Nunca** o caminho inverso (`SQL manual em produção → talvez vire arquivo depois`). Isso foi exatamente o que causou o drift reconciliado na Fase 14A: 82 migrations aplicadas em produção contra 70 arquivos no repositório, sendo 12 delas sem nenhum arquivo local e 58 com o arquivo local nomeado com um timestamp diferente do `version` real registrado em `supabase_migrations.schema_migrations` — o que faria qualquer ferramenta baseada em nome de arquivo (CLI, `db push`, `migration list`) interpretar incorretamente o histórico.

## Convenção de nome (obrigatória)

`<versão de 14 dígitos>_<nome_descritivo>.sql`, onde a versão **precisa ser exatamente** o timestamp que o Supabase vai gravar em `supabase_migrations.schema_migrations.version` no momento em que a migration for aplicada — nunca um timestamp "ajustado" para ficar bonito na ordenação alfabética do repositório. A ordem lexicográfica do arquivo *é* a ordem de aplicação; não reordenar manualmente.

## Se uma correção emergencial precisar rodar direto em produção

Procedimento obrigatório e imediato (nunca "depois"):
1. Rodar a correção via `apply_migration` (nunca `execute_sql` para DDL) — isso já registra a `version`/`statements` exatos em `schema_migrations`.
2. **Na mesma sessão**, copiar o SQL exato de `supabase_migrations.schema_migrations.statements` para um arquivo local com o nome `<version>_<nome>.sql`.
3. Commitar esse arquivo antes de considerar a correção concluída — "aplicado em produção" e "reconciliado no repo" são a mesma entrega, nunca duas etapas separadas no tempo.

## Verificação de drift

Rode `scripts/check-migrations-drift.sh` (requer Supabase CLI autenticado e projeto linkado) antes de qualquer deploy ou merge que toque `supabase/migrations/`. Ele falha (`exit 1`) se encontrar:
- uma migration aplicada remotamente sem arquivo local correspondente;
- um arquivo local cuja versão não está registrada como aplicada remotamente (migration pendente esquecida, ou nome de arquivo com timestamp incorreto).

## Reconstrução em ambiente limpo

`supabase/config.toml` fixa o `project_id` deste repositório — impede que `supabase db push`/`link` sem `--project-ref` explícito mire um projeto Supabase diferente por engano. Para testar reconstrução completa: `supabase start` (requer Docker) aplica todos os arquivos de `supabase/migrations/` do zero em Postgres local; comparar o schema resultante contra produção antes de confiar num ambiente novo.

## ⚠️ Pendência obrigatória antes do lançamento público

A Fase 14A reconciliou os 82 arquivos locais com o histórico real de produção (nomes/versões conferidos 1:1, e o efeito de cada uma das 12 migrations recuperadas foi verificado diretamente em produção via introspecção read-only). **O que ainda não foi provado**: um `git clone` limpo deste repositório, seguido de `supabase db push`/`supabase start`, reconstrói o schema do zero sem erro, do primeiro ao último arquivo, em sequência.

Isso não pôde ser testado nesta fase porque:
- Docker não está disponível neste ambiente (`supabase start` depende dele);
- branching do Supabase (alternativa sem Docker) exige plano Pro ou superior, que este projeto não tem.

**Decisão registrada**: não fazer upgrade de plano nem instalar infraestrutura adicional só por causa deste teste agora — a pendência fica formalmente aberta e **bloqueia apenas o lançamento público**, não a Fase 14B. Antes de aceitar usuários reais, alguém precisa rodar, com Docker disponível (localmente ou em CI) ou um plano com branching:

```
git clone <repo> --branch main /tmp/posttou-clean
cd /tmp/posttou-clean
supabase start          # aplica todos os 82 arquivos do zero em Postgres local
# comparar schema resultante contra produção (mesmas checagens de pg_catalog usadas na 14A)
```

Se essa reconstrução falhar em qualquer arquivo, é sinal de que a reconciliação da 14A tem uma divergência de conteúdo não capturada pela verificação de nome/versão — precisa ser investigada antes do lançamento, não depois.
