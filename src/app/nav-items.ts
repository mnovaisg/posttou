export interface NavItem {
  label: string
  path: string
  icon: string
  implemented: boolean
}

// Bloco 7: ordem reflete a jornada do usuário (criar → identidade →
// oportunidades → automatizar → medir → colaborar → configurar), não a
// ordem em que os módulos foram desenvolvidos. "Criar com IA" não tem
// mais item próprio — os dois caminhos de criação (manual/IA) já vivem
// dentro de Meu Conteúdo desde o Bloco 6, e a rota /criar continua
// existindo normalmente, só sem entrada direta na navegação principal.
// "Plano e Cobrança" idem: continua acessível via /plano-e-cobranca e
// pelo atalho contextual em Configurações, sem item próprio no menu
// principal — mantém a sidebar nos 7 itens aprovados.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Meu Conteúdo', path: '/conteudo', icon: '🏠', implemented: true },
  { label: 'DNA da Marca', path: '/dna-da-marca', icon: '🧠', implemented: true },
  { label: 'Radar Viral', path: '/radar', icon: '🔥', implemented: true },
  { label: 'Piloto Automático', path: '/piloto-automatico', icon: '🤖', implemented: true },
  { label: 'Desempenho', path: '/relatorios', icon: '📊', implemented: true },
  { label: 'Equipe', path: '/equipe', icon: '👥', implemented: true },
  { label: 'Configurações', path: '/configuracoes', icon: '⚙️', implemented: true },
]
