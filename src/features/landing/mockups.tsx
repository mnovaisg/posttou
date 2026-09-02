// Bloco 11 — mini-demonstrações visuais do produto real, usadas no Hero e
// na seção "Tudo que seu conteúdo precisa". Construídas com os mesmos
// componentes/tokens de UI do POSTTOU (Badge, Button, cores de marca) e
// com os assets REAIS de Estilo de Marca (Bloco 10.1, gerados uma única
// vez, já usados na tela autenticada) — nunca uma tela fictícia com
// recursos que não existem. Não são screenshots pixel-a-pixel da tela
// autenticada (fora do alcance das ferramentas desta sessão), mas usam
// exatamente a mesma linguagem visual, cópia e dados reais do produto.
import type * as React from 'react'
import fotograficoImg from '@/assets/brand-style/fotografico.png'
import modernoImg from '@/assets/brand-style/moderno.png'
import editorialImg from '@/assets/brand-style/editorial.png'
import popImg from '@/assets/brand-style/pop.png'
import { Badge } from '@/components/ui/badge'

function MockCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 ${className}`}>
      {children}
    </div>
  )
}

export function DnaMockup() {
  return (
    <MockCard>
      <p className="text-xs font-semibold text-ink-400">DNA da Marca</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="h-6 w-6 rounded-full" style={{ background: '#6748fa' }} />
        <span className="h-6 w-6 rounded-full" style={{ background: '#ec4899' }} />
        <span className="h-6 w-6 rounded-full" style={{ background: '#f97316' }} />
        <Badge variant="neutral" className="ml-1">
          Autoridade
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <img src={fotograficoImg} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" decoding="async" />
        <img src={modernoImg} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" decoding="async" />
        <img src={editorialImg} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" decoding="async" />
      </div>
    </MockCard>
  )
}

export function CreateMockup() {
  return (
    <MockCard>
      <p className="text-xs font-semibold text-ink-400">Criação com IA</p>
      <div className="mt-3 flex gap-3">
        <img src={popImg} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" decoding="async" />
        <div className="flex-1 space-y-2 pt-1">
          <p className="text-sm font-medium text-ink-900 dark:text-ink-50">5 dicas para vender mais</p>
          <div className="h-2 w-full rounded-full bg-ink-100 dark:bg-ink-800" />
          <div className="h-2 w-4/5 rounded-full bg-ink-100 dark:bg-ink-800" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="neutral">#dicas</Badge>
        <Badge variant="neutral">#marketing</Badge>
        <Badge variant="brand">Carrossel</Badge>
      </div>
    </MockCard>
  )
}

export function RadarMockup() {
  return (
    <MockCard>
      <p className="text-xs font-semibold text-ink-400">Radar Viral</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="brand">+ marketing digital</Badge>
        <Badge variant="brand">+ #dicas</Badge>
      </div>
      <div className="mt-3 rounded-lg bg-ink-50 p-3 dark:bg-ink-800">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink-900 dark:text-ink-50">Oportunidade encontrada</p>
          <Badge variant="success">82/100</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-500">Baseado em sinais do YouTube · cruzado com seu DNA</p>
      </div>
    </MockCard>
  )
}

export function PilotMockup() {
  const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
  const active = [1, 3]
  return (
    <MockCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-400">Piloto Automático</p>
        <Badge variant="brand">2 posts/semana</Badge>
      </div>
      <div className="mt-3 flex gap-1.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={`flex h-9 flex-1 items-center justify-center rounded-lg text-xs font-medium ${
              active.includes(i) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500">Ter · 18:00 — "conteúdo de autoridade"</p>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 dark:border-ink-800">
        <span className="text-xs font-medium text-ink-800 dark:text-ink-100">Sempre aguardar aprovação</span>
        <span className="flex h-4 w-8 items-center rounded-full bg-brand-600 p-0.5">
          <span className="h-3 w-3 translate-x-4 rounded-full bg-white" />
        </span>
      </div>
    </MockCard>
  )
}

export function PerformanceMockup() {
  const bars = [40, 65, 50, 80, 60]
  return (
    <MockCard>
      <p className="text-xs font-semibold text-ink-400">Desempenho</p>
      <div className="mt-3 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-brand-500/70" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">
        Conteúdos educativos tiveram mais engajamento este mês.
      </div>
    </MockCard>
  )
}
