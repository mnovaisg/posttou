// Monta o prompt de cada tipo de geração a partir do DNA da marca +
// histórico recente de conteúdo (para evitar repetição). Único lugar do
// sistema que decide "como pedir isso para a IA" — a Edge Function só
// chama buildPrompt() e envia o resultado ao provider via gateway.
import { brandProfileToPromptText } from './brand-context.ts'

export type GenerationType = 'post_unico' | 'carrossel' | 'reels_roteiro' | 'legenda' | 'ideias_conteudo' | 'ideias_onboarding'

export interface HistoryItem {
  title: string | null
  caption: string | null
  type: string
  created_at: string
}

export interface PromptInput {
  generationType: GenerationType
  objective?: string
  format?: string
  themeInput: string
  brandProfile: Record<string, unknown> | null
  history: HistoryItem[]
}

const RESPONSE_SCHEMA: Record<GenerationType, string> = {
  post_unico: `Responda APENAS com um JSON válido no formato exato:
{
  "caption": "string (legenda completa, pronta para publicar)",
  "hashtags": ["string"],
  "cta": "string"
}`,
  carrossel: `Responda APENAS com um JSON válido no formato exato:
{
  "caption": "string (legenda completa do carrossel)",
  "hashtags": ["string"],
  "cta": "string",
  "slides": ["string (texto de cada slide, na ordem, entre 3 e 8 slides)"]
}`,
  reels_roteiro: `Responda APENAS com um JSON válido no formato exato:
{
  "caption": "string (legenda completa do reel)",
  "hashtags": ["string"],
  "cta": "string",
  "script": {
    "hook": "string (primeiros 2-3 segundos)",
    "development": "string (desenvolvimento do roteiro)",
    "closing": "string (fechamento + CTA falado)"
  }
}`,
  legenda: `Responda APENAS com um JSON válido no formato exato:
{
  "caption": "string (legenda completa, pronta para publicar)",
  "hashtags": ["string"],
  "cta": "string"
}`,
  ideias_conteudo: `Responda APENAS com um JSON válido no formato exato:
{
  "ideas": [
    { "title": "string", "description": "string", "suggested_type": "post" | "carrossel" | "reel" }
  ]
}
Gere entre 5 e 8 ideias.`,
  // Etapa 3 do onboarding — só 3 ideias (não 5-8), uma por objetivo,
  // pensadas para o primeiro conteúdo real do usuário (rápido, sem
  // sobrecarregar com opções).
  ideias_onboarding: `Responda APENAS com um JSON válido no formato exato:
{
  "ideas": [
    {
      "title": "string",
      "description": "string",
      "suggested_type": "post" | "carrossel" | "reel",
      "objective": "vender" | "educar" | "autoridade" | "relacionamento" | "leads" | "alcance" | "engajamento" | "divulgar"
    }
  ]
}
Gere EXATAMENTE 3 ideias. Cada uma deve ter um "objective" DIFERENTE das outras duas — escolha os 3 objetivos mais relevantes para esta marca especificamente (ex.: uma ideia para atrair/alcançar novas pessoas, outra para engajar quem já segue, outra para gerar vendas/leads — adapte à realidade real da marca, não force um roteiro genérico). "suggested_type" deve ser "post" para todas as 3 (formato simples, gerado rápido — nunca "carrossel" ou "reel" aqui).`,
}

const OBJECTIVE_INSTRUCTION: Record<string, string> = {
  vender: 'O objetivo é gerar vendas diretas ou intenção de compra.',
  educar: 'O objetivo é educar/ensinar algo de valor para a audiência.',
  autoridade: 'O objetivo é construir autoridade e credibilidade da marca.',
  relacionamento: 'O objetivo é fortalecer relacionamento e proximidade com a audiência.',
  leads: 'O objetivo é gerar leads (capturar contato/interesse).',
  alcance: 'O objetivo é maximizar alcance e viralização.',
  engajamento: 'O objetivo é maximizar comentários, curtidas e compartilhamentos.',
  divulgar: 'O objetivo é divulgar um produto, serviço ou evento específico.',
}

function historyToPromptText(history: HistoryItem[]): string {
  if (!history.length) return 'Nenhum conteúdo anterior registrado ainda.'
  return history
    .slice(0, 15)
    .map((item, i) => `${i + 1}. [${item.type}] ${item.title ?? 'sem título'}${item.caption ? ` — ${item.caption.slice(0, 140)}` : ''}`)
    .join('\n')
}

export function buildPrompt(input: PromptInput): { systemPrompt: string; userPrompt: string } {
  const brandText = brandProfileToPromptText(input.brandProfile)
  const historyText = historyToPromptText(input.history)
  const objectiveText = input.objective ? OBJECTIVE_INSTRUCTION[input.objective] ?? input.objective : ''

  const systemPrompt = [
    'Você é o assistente de criação de conteúdo do POSTTOU, um SaaS de gestão de Instagram.',
    'Sua função é gerar conteúdo para Instagram que soe genuinamente como a marca descrita abaixo — nunca genérico.',
    'Sempre responda em português do Brasil (salvo instrução contrária no DNA da marca).',
    '',
    '=== DNA DA MARCA (obrigatório seguir) ===',
    brandText,
    '',
    '=== HISTÓRICO RECENTE DE CONTEÚDO (não repetir temas/ganchos/frases já usados) ===',
    historyText,
  ].join('\n')

  const formatLine = input.format ? `Formato: ${input.format}.` : ''
  const userPrompt = [
    objectiveText,
    formatLine,
    `Tema/intenção informado pelo usuário: """${input.themeInput}"""`,
    '',
    RESPONSE_SCHEMA[input.generationType],
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}
