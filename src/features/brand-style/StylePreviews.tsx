// Bloco 10.1 — previews reais e próprios do POSTTOU para Estilo de
// Imagem/Design, substituindo os retângulos abstratos anteriores.
// 100% SVG vetorial autoral (nenhum asset de terceiros, nenhuma chamada
// ao Kie.ai, zero custo, renderiza instantaneamente) — mesmo assunto
// (uma xícara de café) nos 3 exemplos de Estilo de Imagem, e o mesmo
// post-modelo (headline + legenda) nos 5 exemplos de Estilo de Design,
// para que a comparação seja sobre o TRATAMENTO visual, não o conteúdo.

function tint(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`
}

export function ImageStylePreview({ style, primary }: { style: 'fotografico' | 'ilustracao' | '3d'; primary: string }) {
  const titleId = `img-style-${style}`

  if (style === 'fotografico') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo fotográfico: xícara de café com luz natural</title>
        <defs>
          <radialGradient id="photo-bg" cx="25%" cy="20%" r="90%">
            <stop offset="0%" stopColor="#e8c9a0" />
            <stop offset="55%" stopColor="#8a5a3b" />
            <stop offset="100%" stopColor="#3b2416" />
          </radialGradient>
          <linearGradient id="photo-cup" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf6ec" />
            <stop offset="100%" stopColor="#c9b79c" />
          </linearGradient>
          <filter id="photo-blur"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <rect width="160" height="100" fill="url(#photo-bg)" />
        <circle cx="132" cy="18" r="20" fill="#fff6df" opacity="0.35" filter="url(#photo-blur)" />
        <ellipse cx="72" cy="82" rx="34" ry="7" fill="#000" opacity="0.35" filter="url(#photo-blur)" />
        <path d="M50 45 h44 l-5 30 a20 20 0 0 1 -34 0 Z" fill="url(#photo-cup)" stroke="#3b2416" strokeWidth="1" opacity="0.95" />
        <path d="M94 52 q14 2 12 16 q-2 12 -14 10" fill="none" stroke="#fdf6ec" strokeWidth="3" opacity="0.85" />
        <path d="M62 40 q-3 -8 2 -14" fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        <path d="M72 38 q-3 -8 2 -14" fill="none" stroke="#fff" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
        <rect width="160" height="100" fill="url(#photo-bg)" opacity="0" />
        <rect x="0" y="0" width="160" height="100" fill="#000" opacity="0.08" />
      </svg>
    )
  }

  if (style === 'ilustracao') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo ilustração: xícara de café em traço e cor chapada</title>
        <rect width="160" height="100" fill={tint(primary, '1a')} />
        <circle cx="128" cy="20" r="12" fill={tint(primary, 'cc')} />
        <path d="M46 42 h48 l-4 32 a22 22 0 0 1 -40 0 Z" fill="#ffffff" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="70" cy="78" rx="30" ry="6" fill="none" stroke="#1a1a1a" strokeWidth="3" />
        <path d="M94 48 q16 1 14 18 q-2 14 -16 12" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
        <path d="M56 34 q-2 -6 2 -11" fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" />
        <path d="M68 34 q-2 -6 2 -11" fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" />
        <path d="M80 34 q-2 -6 2 -11" fill="none" stroke={primary} strokeWidth="3" strokeLinecap="round" />
        <circle cx="20" cy="80" r="6" fill={tint(primary, '99')} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Exemplo de estilo 3D: xícara de café renderizada com volume</title>
      <defs>
        <linearGradient id="d3-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2f0ea" />
          <stop offset="100%" stopColor="#dcd8cd" />
        </linearGradient>
        <linearGradient id="d3-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={tint(primary, 'ff')} />
          <stop offset="55%" stopColor={primary} />
          <stop offset="100%" stopColor="#00000055" />
        </linearGradient>
        <linearGradient id="d3-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={tint(primary, 'aa')} />
        </linearGradient>
        <filter id="d3-shadow"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="160" height="100" fill="url(#d3-bg)" />
      <rect x="18" y="14" width="26" height="26" rx="6" fill={tint(primary, '33')} transform="rotate(18 31 27)" />
      <ellipse cx="72" cy="84" rx="32" ry="7" fill="#000" opacity="0.18" filter="url(#d3-shadow)" />
      <path d="M48 46 h44 l-4 28 a20 20 0 0 1 -36 0 Z" fill="url(#d3-body)" />
      <ellipse cx="70" cy="46" rx="22" ry="7" fill="url(#d3-top)" />
      <path d="M92 52 q18 0 16 16 q-2 13 -17 11 v-6 q9 1 10 -6 q1 -9 -9 -9 Z" fill={tint(primary, 'cc')} />
      <ellipse cx="63" cy="43" rx="6" ry="2.4" fill="#ffffff" opacity="0.8" />
    </svg>
  )
}

const DEMO_KICKER = 'GUARDE ESTE POST'

export function DesignStylePreview({ style, primary }: { style: 'moderno' | 'editorial' | 'pop' | 'minimalista' | 'impactante'; primary: string }) {
  const titleId = `design-style-${style}`

  if (style === 'moderno') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo moderno: tipografia grande sobre gradiente geométrico</title>
        <defs>
          <linearGradient id="mod-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor="#1a1a1a" />
          </linearGradient>
        </defs>
        <rect width="160" height="100" fill="url(#mod-bg)" />
        <rect x="0" y="0" width="46" height="100" fill="#ffffff" opacity="0.06" />
        <text x="14" y="34" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="17" fill="#fff">5 dicas</text>
        <text x="14" y="52" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="17" fill="#fff">para vender</text>
        <text x="14" y="70" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="17" fill="#fff">mais</text>
        <rect x="14" y="80" width="34" height="10" rx="5" fill="#fff" />
        <text x="19" y="87.5" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="6" fill={primary}>SWIPE →</text>
      </svg>
    )
  }

  if (style === 'editorial') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo editorial: composição de revista com linhas finas e serifa</title>
        <rect width="160" height="100" fill="#faf8f3" />
        <line x1="14" y1="16" x2="146" y2="16" stroke="#1a1a1a" strokeWidth="1" />
        <text x="14" y="12" fontFamily="Georgia, serif" fontSize="6" letterSpacing="1.5" fill="#7a7368">{DEMO_KICKER}</text>
        <text x="14" y="42" fontFamily="Georgia, serif" fontWeight="700" fontSize="15" fill="#1a1a1a">5 dicas para</text>
        <text x="14" y="60" fontFamily="Georgia, serif" fontWeight="700" fontSize="15" fill="#1a1a1a">vender mais</text>
        <line x1="14" y1="70" x2="70" y2="70" stroke={primary} strokeWidth="2" />
        <text x="14" y="86" fontFamily="Georgia, serif" fontSize="7" fill="#4a453d">Edição de hoje · Guia rápido</text>
        <line x1="14" y1="94" x2="146" y2="94" stroke="#1a1a1a" strokeWidth="1" />
      </svg>
    )
  }

  if (style === 'pop') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo pop: cores saturadas, contraste alto e padrão de bolinhas</title>
        <defs>
          <pattern id="pop-dots" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill="#ffffff" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="160" height="100" fill={primary} />
        <rect x="0" y="60" width="160" height="40" fill="#111111" />
        <rect x="0" y="60" width="160" height="40" fill="url(#pop-dots)" />
        <circle cx="140" cy="18" r="16" fill="#ffffff" opacity="0.9" />
        <circle cx="140" cy="18" r="16" fill="none" stroke="#111" strokeWidth="2" />
        <text x="14" y="34" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="19" fill="#fff">5 DICAS</text>
        <text x="14" y="52" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="19" fill="#111">PRA VENDER!</text>
        <text x="14" y="84" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="8" fill="#fff">MAIS ✨ HOJE ✨ AGORA</text>
      </svg>
    )
  }

  if (style === 'minimalista') {
    return (
      <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Exemplo de estilo minimalista: espaço em branco generoso e poucos elementos</title>
        <rect width="160" height="100" fill="#ffffff" stroke="#eceae5" strokeWidth="1" />
        <text x="14" y="18" fontFamily="Arial, sans-serif" fontSize="6" letterSpacing="2" fill="#a8a29a">DICA 01</text>
        <text x="80" y="56" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="14" fill="#1a1a1a">
          Vender mais
        </text>
        <line x1="70" y1="66" x2="90" y2="66" stroke={primary} strokeWidth="1.5" />
        <circle cx="146" cy="86" r="4" fill={primary} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 160 100" className="h-20 w-full overflow-hidden rounded-lg" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Exemplo de estilo impactante: blocos grandes, diagonais e alto contraste</title>
      <rect width="160" height="100" fill="#0a0a0a" />
      <polygon points="0,100 70,0 110,0 40,100" fill={primary} />
      <text x="120" y="30" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="30" fill="#fff">5</text>
      <text x="14" y="72" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="15" fill="#fff">VENDER</text>
      <text x="14" y="90" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="15" fill="#fff">MAIS</text>
    </svg>
  )
}
