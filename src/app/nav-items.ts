import { Home, Brain, Radar, Bot, BarChart3, Users, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
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
// Bloco 7.1: ícones trocados de emoji para lucide-react (mesma
// biblioteca já usada em GridView/UndatedContentStrip) — família visual
// consistente, sem depender do emoji set do sistema operacional.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Meu Conteúdo', path: '/conteudo', icon: Home, implemented: true },
  { label: 'DNA da Marca', path: '/dna-da-marca', icon: Brain, implemented: true },
  { label: 'Radar Viral', path: '/radar', icon: Radar, implemented: true },
  { label: 'Piloto Automático', path: '/piloto-automatico', icon: Bot, implemented: true },
  { label: 'Desempenho', path: '/relatorios', icon: BarChart3, implemented: true },
  { label: 'Equipe', path: '/equipe', icon: Users, implemented: true },
  { label: 'Configurações', path: '/configuracoes', icon: Settings, implemented: true },
]
