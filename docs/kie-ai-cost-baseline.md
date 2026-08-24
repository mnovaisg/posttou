# Custo real medido — Kie.ai (amostra única)

Medição real feita em 2026-08-24, pelo pipeline real do Piloto Automático
(`pilot-content-generate` → geração de texto + 1 arte), workspace de teste.
Não é uma média nem uma projeção — é uma única amostra e não deve ser usada
para recalcular preços/`ai_operation_costs` sozinha.

## Amostra

- Saldo Kie.ai inicial: **999,87** créditos
- Saldo Kie.ai final: **993,65** créditos
- Consumo real Kie.ai: **6,22 créditos** para 1 post simples completo
- Chamadas ao provider: 1× `gpt-5-2` (texto: legenda + hashtags + CTA em
  uma única chamada) + 1× `gpt4o-image` (1 arte, formato `2:3`)
- Créditos internos POSTTOU debitados: **20** (`ai_operation_costs`:
  post_unico = 5 + imagem = 15)

## Leitura

Custo real Kie.ai por post simples com 1 arte, nesta amostra: ~6,22
créditos Kie.ai por 20 créditos internos POSTTOU cobrados do workspace —
ou seja, a franquia interna cobra mais créditos do usuário do que o custo
real observado no provider nesta amostra (margem positiva na amostra).

Uma amostra não estabelece variância nem cobre casos como carrossel
(múltiplas artes) ou retries. Antes de qualquer ajuste de preço, repetir a
medição algumas vezes (idealmente incluindo 1 carrossel) para ter uma
faixa, não um ponto único.
