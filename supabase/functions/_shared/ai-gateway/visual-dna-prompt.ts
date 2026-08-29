// Fase 12 — Prompt do estágio 1 (texto): gera UM brief criativo
// compartilhado + 3 conjuntos de atributos de vocabulário fixo (ajuste 2 —
// comparabilidade obrigatória: mesmo tema/mensagem/objetivo, só o
// tratamento visual varia entre A/B/C — nunca 3 assuntos diferentes).
import { VISUAL_DNA_VOCABULARY } from './visual-dna-context.ts'

export interface VisualDnaPromptInput {
  brandText: string
  referencesText: string
}

const VOCAB_BLOCK = Object.entries(VISUAL_DNA_VOCABULARY)
  .map(([key, values]) => `"${key}": um destes valores exatos → [${values.map((v) => `"${v}"`).join(', ')}]`)
  .join('\n')

const RESPONSE_SCHEMA = `Responda APENAS com um JSON válido no formato exato:
{
  "shared_brief": {
    "theme": "string — o tema/assunto do post (mesmo para A, B e C)",
    "message": "string — a mensagem central (mesma para A, B e C)",
    "objective": "string — objetivo do post (mesmo para A, B e C)"
  },
  "options": [
    {
      "label": "A",
      "attributes": { ${Object.keys(VISUAL_DNA_VOCABULARY).map((k) => `"${k}": "string"`).join(', ')} },
      "attributes_summary": "string curta pra UI, ex: 'títulos fortes, pouco texto, contraste elevado'",
      "image_prompt": "string — descrição visual detalhada em inglês para um gerador de imagem, coerente com os atributos acima, SEM texto/legenda dentro da imagem"
    },
    { "label": "B", ... mesma estrutura ... },
    { "label": "C", ... mesma estrutura ... }
  ]
}
Vocabulário fixo — cada atributo DEVE usar exatamente um dos valores permitidos, nunca um valor livre:
${VOCAB_BLOCK}
As 3 opções devem compartilhar o MESMO tema/mensagem/objetivo (shared_brief) — a variação entre elas deve estar SOMENTE nos atributos visuais (direção, hierarquia, composição, densidade, contraste, tipografia, tratamento gráfico, papel da imagem). Nunca gere 3 assuntos diferentes.`

// Etapa 3, Decisão 2 (Opção A) — não gera uma imagem nova nem 3 opções:
// interpreta em texto a arte que JÁ foi criada para o primeiro conteúdo
// (a partir do mesmo contexto usado pra gerá-la), produzindo só os
// atributos estruturados de UMA direção, no mesmo vocabulário fixo.
export interface VisualDnaInterpretationInput {
  brandText: string
  /** Tema/prompt que já gerou a arte do primeiro conteúdo — a interpretação parte disso, não de uma imagem nova. */
  contentContext: string
}

const INTERPRETATION_RESPONSE_SCHEMA = `Responda APENAS com um JSON válido no formato exato:
{
  "attributes": { ${Object.keys(VISUAL_DNA_VOCABULARY).map((k) => `"${k}": "string"`).join(', ')} },
  "attributes_summary": "string curta pra UI, ex: 'acolhedor, orgânico, limpo, baixo contraste'"
}
Vocabulário fixo — cada atributo DEVE usar exatamente um dos valores permitidos, nunca um valor livre:
${VOCAB_BLOCK}`

export function buildVisualDnaInterpretationPrompt(input: VisualDnaInterpretationInput): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'Você é o motor de direção criativa visual do POSTTOU, um SaaS de gestão de Instagram.',
    'Sua tarefa AGORA é interpretar, em atributos estruturados, o estilo visual de uma arte que JÁ foi criada para esta marca — você não está propondo uma imagem nova, só classificando a direção visual que ela representa.',
    '',
    'Sempre responda em português do Brasil.',
  ].join('\n')

  const userPrompt = [
    '=== DNA DA MARCA ===',
    input.brandText,
    '',
    '=== CONTEXTO/TEMA DA ARTE JÁ CRIADA ===',
    input.contentContext,
    '',
    INTERPRETATION_RESPONSE_SCHEMA,
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}

export function buildVisualDnaPrompt(input: VisualDnaPromptInput): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'Você é o motor de direção criativa visual do POSTTOU, um SaaS de gestão de Instagram.',
    'Sua tarefa é propor 3 direções visuais (A, B, C) para uma marca, todas para o MESMO post (mesmo tema/mensagem/objetivo) — a única coisa que varia é o tratamento visual.',
    '',
    '=== REGRA ANTI-CÓPIA OBRIGATÓRIA ===',
    'Referências de inspiração (se houver) servem só para entender a DIREÇÃO desejada. Nunca copie texto, legendas, frases, slogans, layout exato ou elementos gráficos distintivos de nenhuma referência. Produza sempre algo original e coerente com o DNA da marca.',
    '',
    'Sempre responda em português do Brasil, exceto o campo "image_prompt" que deve ser em inglês (linguagem de geração de imagem).',
  ].join('\n')

  const userPrompt = [
    '=== DNA DA MARCA ===',
    input.brandText,
    '',
    input.referencesText ? `=== REFERÊNCIAS DE INSPIRAÇÃO ===\n${input.referencesText}` : '',
    '',
    RESPONSE_SCHEMA,
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}
