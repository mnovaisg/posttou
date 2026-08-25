import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { getContentSummary } from '@/features/content/api'
import { fetchOnboardingState } from '@/features/onboarding/api'
import { DEFAULT_FILTERS } from '@/features/content/types'
import type { ContentFilters, ViewMode } from '@/features/content/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CreateContentDialog } from '@/features/content/components/CreateContentDialog'
import { ListView } from '@/features/content/views/ListView'
import { GridView } from '@/features/content/views/GridView'
import { CalendarView } from '@/features/content/views/CalendarView'

const VIEW_TABS: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'lista', label: 'Lista', icon: '📋' },
  { value: 'grade', label: 'Grade', icon: '▦' },
  { value: 'calendario', label: 'Calendário', icon: '📅' },
]

export function ContentPage() {
  const navigate = useNavigate()
  const { activeWorkspace, hasRole } = useWorkspace()
  const [view, setView] = React.useState<ViewMode>('lista')
  const [filters, setFilters] = React.useState<ContentFilters>(DEFAULT_FILTERS)
  const [createOpen, setCreateOpen] = React.useState(false)
  const canCreate = hasRole(['owner', 'admin', 'editor'])

  const { data: summary } = useQuery({
    queryKey: ['content-summary', activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: () => getContentSummary(activeWorkspace!.id),
  })

  // Mesma queryKey do OnboardingWidget/Dashboard — dedupe via React Query,
  // sem chamada extra. Só usada para decidir o texto/CTA do empty state
  // (item 8 do ajuste pré-beta: "Meu Conteúdo" nunca é bloqueado, mas o
  // empty state deve orientar para o DNA primeiro quando ele não existe).
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding-state', activeWorkspace?.id],
    queryFn: () => fetchOnboardingState(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  })
  const hasBrandDna = onboarding?.brand_dna_done ?? true

  // canCreate (owner/admin/editor) também governa a etapa de DNA — mesmo
  // papel exigido para escrever em brand_profiles (item 14: nunca mostrar
  // CTA que o papel do usuário não pode executar).
  const emptyState = hasBrandDna
    ? {
        title: 'Vamos criar seu primeiro conteúdo',
        description: 'Comece criando seu primeiro post, carrossel ou reel.',
        ctaLabel: '+ Criar meu primeiro conteúdo',
        onCreate: canCreate ? () => setCreateOpen(true) : undefined,
      }
    : {
        title: 'Antes do seu primeiro conteúdo, vamos conhecer sua marca',
        description:
          'O POSTTOU usa o DNA da sua marca para criar conteúdos mais alinhados ao seu público, posicionamento e jeito de comunicar.',
        ctaLabel: 'Criar meu DNA',
        onCreate: canCreate ? () => navigate('/dna-da-marca') : undefined,
      }

  function patchFilters(patch: Partial<ContentFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  if (!activeWorkspace) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Meu Conteúdo</h1>
          <p className="text-sm text-ink-500">Organize, revise e agende tudo o que sua marca vai publicar.</p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}>+ Criar conteúdo</Button>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total" value={summary?.total} />
        <SummaryCard label="Rascunhos" value={summary?.rascunho} />
        <SummaryCard label="Agendados" value={summary?.agendado} />
        <SummaryCard label="Publicados" value={summary?.publicado} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg border border-ink-200 p-1 dark:border-ink-700">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setView(tab.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === tab.value
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <Input
          placeholder="Buscar por título ou legenda…"
          value={filters.search}
          onChange={(e) => patchFilters({ search: e.target.value })}
          className="sm:w-64"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.status} onChange={(e) => patchFilters({ status: e.target.value as ContentFilters['status'] })}>
          <option value="todos">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="em_revisao">Em revisão</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="aprovado">Aprovado</option>
          <option value="agendado">Agendado</option>
          <option value="publicando">Publicando</option>
          <option value="publicado">Publicado</option>
          <option value="falhou">Falhou</option>
        </Select>
        <Select value={filters.type} onChange={(e) => patchFilters({ type: e.target.value as ContentFilters['type'] })}>
          <option value="todos">Todos os formatos</option>
          <option value="post">Post</option>
          <option value="carrossel">Carrossel</option>
          <option value="reel">Reel</option>
        </Select>
        <Select value={filters.origin} onChange={(e) => patchFilters({ origin: e.target.value as ContentFilters['origin'] })}>
          <option value="todos">Todas as origens</option>
          <option value="manual">Manual</option>
          <option value="ia">IA</option>
          <option value="radar">Radar</option>
          <option value="autopilot">Piloto Automático</option>
        </Select>
        {view !== 'calendario' && (
          <Select value={filters.period} onChange={(e) => patchFilters({ period: e.target.value as ContentFilters['period'] })}>
            <option value="todos">Qualquer data</option>
            <option value="hoje">Hoje</option>
            <option value="7dias">Próximos 7 dias</option>
            <option value="30dias">Próximos 30 dias</option>
          </Select>
        )}
      </div>

      {view === 'lista' && (
        <ListView workspaceId={activeWorkspace.id} filters={filters} emptyState={emptyState} />
      )}
      {view === 'grade' && (
        <GridView workspaceId={activeWorkspace.id} filters={filters} emptyState={emptyState} />
      )}
      {view === 'calendario' && <CalendarView workspaceId={activeWorkspace.id} timezone={activeWorkspace.timezone} />}

      <CreateContentDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={activeWorkspace.id} />
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-ink-400">{label}</p>
        <p className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{value ?? '—'}</p>
      </CardContent>
    </Card>
  )
}
