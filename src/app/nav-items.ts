export interface NavItem {
  label: string
  path: string
  icon: string
  implemented: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Meu Conteúdo', path: '/conteudo', icon: '🏠', implemented: true },
  { label: 'DNA da Marca', path: '/dna-da-marca', icon: '🧠', implemented: true },
  { label: 'Criar com IA', path: '/criar', icon: '✨', implemented: true },
  { label: 'Radar Viral', path: '/radar', icon: '🔥', implemented: true },
  { label: 'Piloto Automático', path: '/piloto-automatico', icon: '🤖', implemented: false },
  { label: 'Relatórios', path: '/relatorios', icon: '📊', implemented: false },
  { label: 'Configurações', path: '/configuracoes', icon: '⚙️', implemented: true },
]
