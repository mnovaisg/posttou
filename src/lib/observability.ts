// Fase 14C — camada de observabilidade de produção.
//
// Sentry NÃO foi instalado/inicializado: exige uma decisão do usuário
// (plano/custo, DSN) fora do meu escopo decidir sozinho. Esta camada
// existe para que, quando for configurado, a integração seja só plugar o
// provider aqui — nenhum outro arquivo do app precisa mudar, e a
// sanitização abaixo já vale e é testável mesmo sem nenhum provider.
//
// ================= O QUE FALTA PARA CONECTAR O SENTRY =================
// 1. Decisão de plano/custo no sentry.io (ou outro provider) — plano
//    gratuito cobre volumes pequenos de beta fechado; confirmar antes de
//    escalar para produção paga.
// 2. Criar um projeto Sentry do tipo "React" (frontend) — e, se quiser
//    cobrir as Edge Functions também, um segundo projeto "Deno"/"Node"
//    (as Edge Functions rodam em Deno; o SDK `@sentry/deno` cobre isso,
//    mas é uma integração separada desta camada, feita função por função).
// 3. Duas variáveis de ambiente novas:
//    - `VITE_SENTRY_DSN` (frontend, Vite — precisa do prefixo VITE_ pra
//      ser embutida no build do cliente).
//    - Se for cobrir Edge Functions: um secret separado nas Edge
//      Functions do Supabase (ex. `SENTRY_DSN_EDGE`), nunca reaproveitar
//      a mesma DSN do frontend sem necessidade — mantém os dois
//      ambientes rastreáveis separadamente.
// 4. Instalar `@sentry/react` (`npm install @sentry/react`) e inicializar
//    uma vez, o mais cedo possível em `src/main.tsx`, com:
//    - `environment: import.meta.env.MODE` (separa development/production
//      automaticamente — o Vite já define isso).
//    - `tracesSampleRate` conservador pra começar (ex. 0.1-0.2) — decisão
//      de custo, não técnica.
//    - Session Replay OFF por padrão (custa mais e é o item de maior
//      risco de PII vazar sem querer — só ligar depois de configurar
//      `maskAllText`/`blockAllMedia` explicitamente).
// 5. Fonte de verdade dos source maps: o Vite já gera source maps no
//    build de produção — decidir se sobem para o Sentry (melhora stack
//    traces legíveis) via `sentry-vite-plugin`, exige um Auth Token do
//    Sentry como secret de CI/build, nunca commitado.
// 6. Depois de tudo isso configurado, o ÚNICO código a mudar é a linha
//    comentada no fim de `captureException()` abaixo — descomentar e
//    trocar pelo `Sentry.captureException(...)` real. Nada mais no app
//    precisa saber que o Sentry existe.
// =========================================================================
//
// Contrato de sanitização (nunca deve vazar para nenhum provider futuro):
// tokens, API keys, Authorization headers, CPF/CNPJ, e prompts/conteúdo
// completo de IA quando não forem estritamente necessários para depurar.
const SENSITIVE_KEY_PATTERN = /token|secret|password|senha|authorization|api[_-]?key|cpf|cnpj|access_token|refresh_token/i

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max depth]'
  if (typeof value === 'string') {
    // CPF/CNPJ em texto livre (11 ou 14 dígitos seguidos, com ou sem máscara).
    return value.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf redacted]').replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj redacted]')
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const sanitizedContext = context ? redact(context) : undefined

  if (import.meta.env.DEV) {
    console.error('[observability]', error, sanitizedContext)
    return
  }

  // Produção sem provider configurado ainda: não perdemos o erro, só não
  // temos telemetria centralizada até o DSN ser definido.
  console.error('[observability]', error instanceof Error ? error.message : error, sanitizedContext)

  // Ponto de integração futuro (não ativo):
  // if (import.meta.env.VITE_SENTRY_DSN) { Sentry.captureException(error, { extra: sanitizedContext }) }
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  const sanitizedContext = context ? redact(context) : undefined
  if (import.meta.env.DEV) {
    console.warn('[observability]', message, sanitizedContext)
  }
}
