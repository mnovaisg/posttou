// Placeholder visual premium para conteúdo sem arte final
// (visual_asset_status='not_requested' ou equivalente). Nunca é uma
// imagem salva — só apresentação, derivada deterministicamente das
// cores do DNA da marca (quando existirem) e do próprio conteúdo
// (id, formato), para nunca repetir o mesmo visual em cards vizinhos.
// Mesma família de lógica usada nos previews pré-cadastro
// (ContentPreviewCards.tsx), adaptada para aceitar cores em hex direto
// ou em nomes comuns em português — o wizard de DNA aceita os dois
// formatos livremente (TagInput de texto livre).

const COLOR_WORD_MAP: Record<string, string> = {
  roxo: '#7c3aed',
  violeta: '#7c3aed',
  lilas: '#a78bfa',
  preto: '#111827',
  branco: '#f8fafc',
  laranja: '#f97316',
  azul: '#2563eb',
  verde: '#16a34a',
  vermelho: '#dc2626',
  rosa: '#db2777',
  amarelo: '#eab308',
  marrom: '#78350f',
  dourado: '#b45309',
  bege: '#d6cbb8',
  cinza: '#6b7280',
  turquesa: '#0d9488',
  vinho: '#7f1d1d',
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function resolveOneColor(raw: string): string | null {
  const trimmed = raw.trim()
  if (HEX_RE.test(trimmed)) return trimmed
  const key = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return COLOR_WORD_MAP[key] ?? null
}

/** Extrai até 3 cores hex válidas de uma lista livre (hex direto ou nome em português). */
export function resolveDnaColors(colors: string[] | null | undefined): string[] {
  if (!colors) return []
  const resolved: string[] = []
  for (const raw of colors) {
    const hex = resolveOneColor(raw)
    if (hex && !resolved.includes(hex)) resolved.push(hex)
    if (resolved.length >= 3) break
  }
  return resolved
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function adjustHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const target = amount > 0 ? 255 : 0
  const p = Math.abs(amount)
  return rgbToHex(r + (target - r) * p, g + (target - g) * p, b + (target - b) * p)
}

const BRAND_PALETTE = ['#6748fa', '#c026d3', '#f97316']

function padPalette(colors: string[]): [string, string, string] {
  if (colors.length >= 3) return [colors[0], colors[1], colors[2]]
  if (colors.length === 2) return [colors[0], colors[1], adjustHex(colors[0], -0.35)]
  if (colors.length === 1) return [colors[0], adjustHex(colors[0], 0.3), adjustHex(colors[0], -0.35)]
  return [BRAND_PALETTE[0], BRAND_PALETTE[1], BRAND_PALETTE[2]]
}

/** Hash simples e determinístico (mesmo id sempre gera o mesmo índice). */
export function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Gradiente determinístico para o card — nunca repete o mesmo visual em cards vizinhos com a mesma paleta. */
export function contentPlaceholderBackground(seed: string, dnaColors: string[]): string {
  const [c1, c2, c3] = padPalette(dnaColors)
  const variants = [
    `linear-gradient(135deg, ${c1} 0%, ${c2} 60%, ${c3} 100%)`,
    `radial-gradient(circle at 25% 15%, ${c1} 0%, ${c2} 55%, ${c3} 100%)`,
    `linear-gradient(210deg, ${c3} 0%, ${c1} 50%, ${c2} 100%)`,
  ]
  return variants[hashSeed(seed) % variants.length]
}

/** Mesma paleta (com fallback de marca) já resolvida em 3 tons — usada pelas formas abstratas do card. */
export function contentPlaceholderPalette(dnaColors: string[]): [string, string, string] {
  return padPalette(dnaColors)
}

// ---------------------------------------------------------------------
// Objetivo exibido no card "Sem data" — não é um dado persistido à
// parte (contents não guarda "objetivo"): é recalculado a partir do
// título/legenda do próprio conteúdo, com a MESMA lista de palavras
// usada em ContentPreviewCards.tsx/instagram-discovery-claim (Bloco 5/6)
// — nunca um valor aleatório, sempre determinístico e ancorado no texto
// real do card. Sem palavra-chave reconhecida, cai num terceiro
// determinístico (hash do id) só para dar variedade visual, nunca some.
export type ContentObjective = 'descoberta' | 'autoridade' | 'conversao'

const CONVERSAO_WORDS = new Set([
  'venda', 'vendas', 'vender', 'conversao', 'lead', 'leads', 'cta', 'agendar', 'agendamento', 'comprar', 'compra',
])
const AUTORIDADE_WORDS = new Set([
  'autoridade', 'educacao', 'educar', 'educativo', 'conhecimento', 'ensinar', 'ensino', 'relacionamento',
])
const DESCOBERTA_WORDS = new Set(['alcance', 'descoberta', 'descobrir', 'engajamento', 'viral'])

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export const OBJECTIVE_META: Record<ContentObjective, string> = {
  descoberta: 'Descoberta',
  autoridade: 'Autoridade',
  conversao: 'Conversão',
}

export function classifyContentObjective(seed: string, title: string, caption: string | null): ContentObjective {
  const words = normalizeWords(`${title} ${caption ?? ''}`)
  if (words.some((w) => CONVERSAO_WORDS.has(w))) return 'conversao'
  if (words.some((w) => AUTORIDADE_WORDS.has(w))) return 'autoridade'
  if (words.some((w) => DESCOBERTA_WORDS.has(w))) return 'descoberta'
  const order: ContentObjective[] = ['descoberta', 'autoridade', 'conversao']
  return order[hashSeed(seed) % order.length]
}
