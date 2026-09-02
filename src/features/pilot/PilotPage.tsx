import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { fetchInstagramAccount, fetchInstagramAccounts, startInstagramOAuth } from '@/features/instagram/api'
import { fetchActiveVisualDna } from '@/features/brand-visual-dna/api'
import {
  activatePilot,
  approvePilotPlan,
  cancelPilotPlan,
  checkPilotActivationReadiness,
  disablePilot,
  fetchCurrentPilotPlan,
  fetchLatestPilotRuns,
  fetchPilotSettings,
  generatePilotContent,
  generatePilotPlan,
  pausePilot,
  resumePilot,
  skipPilotPlanItem,
  upsertPilotSettings,
} from '@/features/pilot/api'
import { deletePilotScheduleSlot, listPilotScheduleSlots, PilotScheduleSlotConflictError, upsertPilotScheduleSlot } from '@/features/pilot/schedule-api'
import { EDITORIAL_ROLE_LABEL, ITEM_STATUS_LABEL, PLAN_STATUS_LABEL } from '@/features/pilot/types'
import type { PilotEditorialRole, PilotMode, PilotSettingsInput } from '@/features/pilot/types'
import { WeeklyAgenda } from '@/features/pilot/WeeklyAgenda'
import { PilotTour } from '@/features/pilot/PilotTour'
import { cancelExperiment, fetchActiveExperiment, fetchActiveRecommendations } from '@/features/strategy/api'
import { EXPERIMENT_STATUS_LABEL } from '@/features/strategy/types'
import { Link } from 'react-router-dom'
import { formatInTimeZone } from '@/lib/timezone'
import { Camera, Radar as RadarIcon, Sparkles, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const MISSING_LABEL: Record<string, string> = {
  settings_not_created: 'Configure o Piloto (frequência, formatos).',
  brand_dna_incomplete: 'Complete o DNA da marca.',
  schedule_not_set: 'Adicione ao menos 1 horário na agenda semanal.',
  formats_not_set: 'Selecione ao menos um formato.',
  frequency_not_set: 'Defina quantos posts por janela.',
  insufficient_credits: 'Créditos insuficientes para a primeira operação.',
}

function defaultSettingsInput(): PilotSettingsInput {
  return {
    mode: 'assisted',
    planningWindowDays: 7,
    maxPostsPerWindow: 7,
    allowedWeekdays: [1, 3, 5],
    preferredTimes: { default: '18:00' },
    allowedFormats: ['post', 'carrossel'],
    editorialMix: { educativo: 40, autoridade: 20, relacionamento: 20, venda: 20 },
    useRadar: false,
    maxRadarPerWindow: 1,
    radarMinOpportunityScore: 60,
    radarMinConfidence: 'medium',
    temporaryObjective: null,
    temporaryObjectiveExpiresAt: null,
    defaultInstagramAccountId: null,
    maxCreditsPerWindow: null,
    autoGenerateArt: false,
    alwaysRequireApproval: true,
  }
}

/** Pílula liga/desliga própria do POSTTOU — sem lib externa, mesmo padrão visual dos outros toggles do produto. */
function ToggleSwitch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-600'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function PilotPage() {
  const { activeWorkspace, hasRole } = useWorkspace()
  const queryClient = useQueryClient()
  const workspaceId = activeWorkspace?.id ?? ''
  const canConfigure = hasRole(['owner', 'admin'])
  const canApprove = hasRole(['owner', 'admin', 'approver'])
  const canEditItems = hasRole(['owner', 'admin', 'editor'])

  const [form, setForm] = React.useState<PilotSettingsInput>(defaultSettingsInput())
  const [formLoaded, setFormLoaded] = React.useState(false)
  const [scheduleError, setScheduleError] = React.useState<string | null>(null)

  const settingsQuery = useQuery({ queryKey: ['pilot-settings', workspaceId], enabled: !!workspaceId, queryFn: () => fetchPilotSettings(workspaceId) })
  const visualDnaQuery = useQuery({ queryKey: ['brand-visual-dna-active', workspaceId], enabled: !!workspaceId, queryFn: () => fetchActiveVisualDna(workspaceId) })
  const readinessQuery = useQuery({ queryKey: ['pilot-readiness', workspaceId], enabled: !!workspaceId, queryFn: () => checkPilotActivationReadiness(workspaceId) })
  const accountsQuery = useQuery({ queryKey: ['instagram-accounts', workspaceId], enabled: !!workspaceId, queryFn: () => fetchInstagramAccounts(workspaceId) })
  const instagramAccountQuery = useQuery({ queryKey: ['instagram-account', workspaceId], enabled: !!workspaceId, queryFn: () => fetchInstagramAccount(workspaceId) })
  const planQuery = useQuery({ queryKey: ['pilot-plan', workspaceId], enabled: !!workspaceId, queryFn: () => fetchCurrentPilotPlan(workspaceId), refetchInterval: 4000 })
  const runsQuery = useQuery({ queryKey: ['pilot-runs', workspaceId], enabled: !!workspaceId, queryFn: () => fetchLatestPilotRuns(workspaceId) })
  const scheduleQuery = useQuery({ queryKey: ['pilot-schedule-slots', workspaceId], enabled: !!workspaceId, queryFn: () => listPilotScheduleSlots(workspaceId) })

  const connectInstagramMutation = useMutation({
    mutationFn: () => startInstagramOAuth(workspaceId),
    onSuccess: (authorizeUrl) => {
      window.location.href = authorizeUrl
    },
  })

  React.useEffect(() => {
    if (formLoaded) return
    if (settingsQuery.data === undefined || visualDnaQuery.isLoading) return

    if (settingsQuery.data) {
      const s = settingsQuery.data
      setForm({
        mode: s.mode,
        planningWindowDays: s.planning_window_days,
        maxPostsPerWindow: s.max_posts_per_window,
        allowedWeekdays: s.allowed_weekdays,
        preferredTimes: s.preferred_times as PilotSettingsInput['preferredTimes'],
        allowedFormats: s.allowed_formats as PilotSettingsInput['allowedFormats'],
        editorialMix: s.editorial_mix as Record<string, number>,
        useRadar: s.use_radar,
        maxRadarPerWindow: s.max_radar_per_window,
        radarMinOpportunityScore: Number(s.radar_min_opportunity_score),
        radarMinConfidence: s.radar_min_confidence as 'medium' | 'high',
        temporaryObjective: s.temporary_objective,
        temporaryObjectiveExpiresAt: s.temporary_objective_expires_at,
        defaultInstagramAccountId: s.default_instagram_account_id,
        maxCreditsPerWindow: s.max_credits_per_window,
        autoGenerateArt: s.auto_generate_art,
        alwaysRequireApproval: s.always_require_approval,
      })
    } else {
      setForm((f) => ({ ...f, autoGenerateArt: !!visualDnaQuery.data }))
    }
    setFormLoaded(true)
  }, [settingsQuery.data, visualDnaQuery.data, visualDnaQuery.isLoading, formLoaded])

  const saveMutation = useMutation({
    mutationFn: (weekdaysFromSchedule: number[]) =>
      upsertPilotSettings(workspaceId, { ...form, allowedWeekdays: weekdaysFromSchedule.length ? weekdaysFromSchedule : form.allowedWeekdays }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilot-settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['pilot-readiness', workspaceId] })
    },
  })

  const activateMutation = useMutation({
    mutationFn: () => activatePilot(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilot-settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['pilot-readiness', workspaceId] })
    },
  })
  const pauseMutation = useMutation({ mutationFn: () => pausePilot(workspaceId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-settings', workspaceId] }) })
  const resumeMutation = useMutation({ mutationFn: () => resumePilot(workspaceId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-settings', workspaceId] }) })
  const disableMutation = useMutation({ mutationFn: () => disablePilot(workspaceId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-settings', workspaceId] }) })

  const generatePlanMutation = useMutation({
    mutationFn: () => generatePilotPlan(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-plan', workspaceId] }),
  })
  const approvePlanMutation = useMutation({
    mutationFn: (planId: string) => approvePilotPlan(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-plan', workspaceId] }),
  })
  const cancelPlanMutation = useMutation({
    mutationFn: (planId: string) => cancelPilotPlan(planId, 'regenerated_by_user'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-plan', workspaceId] }),
  })
  const generateContentMutation = useMutation({
    mutationFn: (planId: string) => generatePilotContent(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-plan', workspaceId] }),
  })
  const skipItemMutation = useMutation({
    mutationFn: (itemId: string) => skipPilotPlanItem(itemId, 'user_removed'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-plan', workspaceId] }),
  })

  const addSlotMutation = useMutation({
    mutationFn: (vars: { weekday: number; timeOfDay: string; directive: string | null }) => upsertPilotScheduleSlot(workspaceId, vars),
    onSuccess: () => {
      setScheduleError(null)
      queryClient.invalidateQueries({ queryKey: ['pilot-schedule-slots', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['pilot-readiness', workspaceId] })
    },
    onError: (err) => setScheduleError(err instanceof PilotScheduleSlotConflictError ? err.message : 'Não foi possível adicionar o horário.'),
  })
  const removeSlotMutation = useMutation({
    mutationFn: (slotId: string) => deletePilotScheduleSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilot-schedule-slots', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['pilot-readiness', workspaceId] })
    },
  })

  const recommendationsQuery = useQuery({ queryKey: ['strategy-recommendations', workspaceId], enabled: !!workspaceId, queryFn: () => fetchActiveRecommendations(workspaceId) })
  const experimentQuery = useQuery({ queryKey: ['strategy-experiment', workspaceId], enabled: !!workspaceId, queryFn: () => fetchActiveExperiment(workspaceId) })
  const cancelExperimentMutation = useMutation({
    mutationFn: (experimentId: string) => cancelExperiment(experimentId, 'cancelled_by_user'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategy-experiment', workspaceId] }),
  })

  if (!activeWorkspace) return null

  const settings = settingsQuery.data
  const timezone = activeWorkspace.timezone
  const plan = planQuery.data
  const readiness = readinessQuery.data
  const schedule = scheduleQuery.data ?? []
  const scheduleWeekdays = [...new Set(schedule.map((s) => s.weekday))].sort()
  const hasInstagram = !!instagramAccountQuery.data && instagramAccountQuery.data.status === 'conectado'
  const isOn = settings?.status === 'active' || settings?.status === 'paused'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Piloto Automático</h1>
        <p className="mt-1 text-sm text-ink-500">Seu planejamento de conteúdo trabalhando com você — a decisão final de publicar continua sempre sua.</p>
      </div>

      {/* ── Estado principal: Ligado/Desligado bem evidente ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ToggleSwitch
              on={isOn}
              disabled={!canConfigure || activateMutation.isPending || disableMutation.isPending || (!isOn && !readiness?.ready)}
              onClick={() => (isOn ? disableMutation.mutate() : activateMutation.mutate())}
            />
            <div>
              <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">Piloto Automático {isOn ? 'Ligado' : 'Desligado'}</p>
              {settings?.status === 'paused' && <p className="text-xs text-amber-600 dark:text-amber-400">Pausado — não gera novos conteúdos até você reativar.</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canConfigure && settings?.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()}>
                Pausar
              </Button>
            )}
            {canConfigure && settings?.status === 'paused' && (
              <Button size="sm" onClick={() => resumeMutation.mutate()}>
                Reativar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!hasInstagram && canConfigure && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Camera className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
            <p className="text-sm text-brand-900 dark:text-brand-100">
              Seu Instagram ainda não está conectado. O POSTTOU pode preparar conteúdos, mas eles permanecerão como rascunho até você conectar sua conta.
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => connectInstagramMutation.mutate()} disabled={connectInstagramMutation.isPending}>
            {connectInstagramMutation.isPending ? 'Redirecionando…' : 'Conectar Instagram'}
          </Button>
        </div>
      )}

      <PilotTour workspaceId={workspaceId} />

      {/* ── Como funciona ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <h2 className="text-sm font-medium text-ink-900 dark:text-ink-50">Como funciona</h2>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <RadarIcon className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="text-xs">
                <p className="font-medium text-ink-900 dark:text-ink-50">Descoberta de ideias</p>
                <p className="text-ink-500">{form.useRadar ? 'DNA da marca + oportunidades do Radar Viral' : 'DNA da marca'}</p>
              </div>
            </div>
            <span className="hidden text-ink-300 sm:block">→</span>
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="text-xs">
                <p className="font-medium text-ink-900 dark:text-ink-50">Criação do conteúdo</p>
                <p className="text-ink-500">Legenda gerada nos horários da sua agenda</p>
              </div>
            </div>
            <span className="hidden text-ink-300 sm:block">→</span>
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <FileCheck2 className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="text-xs">
                <p className="font-medium text-ink-900 dark:text-ink-50">Revisão/Publicação</p>
                <p className="text-ink-500">{form.alwaysRequireApproval ? 'Sempre aguarda sua aprovação' : 'Tenta publicar sozinho quando possível'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Agenda semanal ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-ink-900 dark:text-ink-50">Agenda semanal</h2>
            <Badge variant="brand">{schedule.length} posts/semana</Badge>
          </div>
          <p className="text-sm text-ink-500">Cada horário representa 1 conteúdo. Adicione uma diretriz opcional para guiar o tema (ex.: "dica prática sobre o produto").</p>
          {scheduleError && <p className="text-sm text-danger-500">{scheduleError}</p>}
          <WeeklyAgenda
            slots={schedule}
            canWrite={canConfigure}
            busy={addSlotMutation.isPending || removeSlotMutation.isPending}
            onAdd={(weekday, timeOfDay, directive) => addSlotMutation.mutate({ weekday, timeOfDay, directive })}
            onRemove={(slotId) => removeSlotMutation.mutate(slotId)}
          />
          {schedule.length === 0 && <p className="text-sm text-amber-600 dark:text-amber-400">Sem nenhum horário, o Piloto não pode ser ligado — adicione ao menos 1.</p>}
        </CardContent>
      </Card>

      {/* ── Configurações ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <h2 className="font-medium text-ink-900 dark:text-ink-50">Configurações</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Modo de geração</Label>
              <Select disabled={!canConfigure} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as PilotMode })}>
                <option value="assisted">Assistido (você aprova o plano)</option>
                <option value="semi_auto">Semi-automático (cron gera o plano sozinho)</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Janela de planejamento (dias)</Label>
              <Input
                disabled={!canConfigure}
                type="number"
                min={3}
                max={14}
                value={form.planningWindowDays}
                onChange={(e) => setForm({ ...form, planningWindowDays: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Máximo de posts na janela</Label>
              <Input
                disabled={!canConfigure}
                type="number"
                min={1}
                max={14}
                value={form.maxPostsPerWindow}
                onChange={(e) => setForm({ ...form, maxPostsPerWindow: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Formatos permitidos</Label>
            <div className="flex gap-2">
              {(['post', 'carrossel'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={!canConfigure}
                  onClick={() =>
                    setForm((f) => ({ ...f, allowedFormats: f.allowedFormats.includes(fmt) ? f.allowedFormats.filter((x) => x !== fmt) : [...f.allowedFormats, fmt] }))
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium ${form.allowedFormats.includes(fmt) ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 dark:bg-ink-800'}`}
                >
                  {fmt === 'post' ? 'Post' : 'Carrossel'}
                </button>
              ))}
              <Badge variant="neutral">Reel — em breve</Badge>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Mix editorial (%)</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['educativo', 'autoridade', 'relacionamento', 'venda'] as const).map((role) => (
                <div key={role} className="flex flex-col gap-1">
                  <span className="text-xs text-ink-500">{EDITORIAL_ROLE_LABEL[role as PilotEditorialRole]}</span>
                  <Input
                    disabled={!canConfigure}
                    type="number"
                    min={0}
                    max={100}
                    value={form.editorialMix[role] ?? 0}
                    onChange={(e) => setForm({ ...form, editorialMix: { ...form.editorialMix, [role]: Number(e.target.value) } })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canConfigure} checked={form.useRadar} onChange={(e) => setForm({ ...form, useRadar: e.target.checked })} />
              Usar oportunidades do Radar Viral
            </label>
            {form.useRadar && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-ink-500">Máx. por janela</span>
                  <Input disabled={!canConfigure} type="number" min={0} value={form.maxRadarPerWindow} onChange={(e) => setForm({ ...form, maxRadarPerWindow: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-ink-500">Score mínimo</span>
                  <Input
                    disabled={!canConfigure}
                    type="number"
                    min={0}
                    max={100}
                    value={form.radarMinOpportunityScore}
                    onChange={(e) => setForm({ ...form, radarMinOpportunityScore: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-ink-500">Confiança mínima</span>
                  <Select disabled={!canConfigure} value={form.radarMinConfidence} onChange={(e) => setForm({ ...form, radarMinConfidence: e.target.value as 'medium' | 'high' })}>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Conta do Instagram padrão</Label>
              <Select
                disabled={!canConfigure}
                value={form.defaultInstagramAccountId ?? ''}
                onChange={(e) => setForm({ ...form, defaultInstagramAccountId: e.target.value || null })}
              >
                <option value="">Nenhuma (fica só como rascunho)</option>
                {(accountsQuery.data ?? []).map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Orçamento máximo de créditos na janela</Label>
              <Input
                disabled={!canConfigure}
                type="number"
                min={1}
                placeholder="Sem limite além do saldo"
                value={form.maxCreditsPerWindow ?? ''}
                onChange={(e) => setForm({ ...form, maxCreditsPerWindow: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-900 dark:text-ink-50">
              <input
                type="checkbox"
                disabled={!canConfigure}
                checked={form.autoGenerateArt}
                onChange={(e) => setForm({ ...form, autoGenerateArt: e.target.checked })}
              />
              Gerar arte automaticamente
            </label>
            <p className="text-xs text-ink-500">
              Cada conteúdo do Piloto ganha uma imagem gerada por IA antes de ir para revisão — usa o DNA Visual confirmado quando existir.{' '}
              {!visualDnaQuery.data && <span className="text-amber-600 dark:text-amber-400">Configure seu DNA Visual para artes mais alinhadas à sua marca.</span>}
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-900 dark:text-ink-50">
              <input
                type="checkbox"
                disabled={!canConfigure}
                checked={form.alwaysRequireApproval}
                onChange={(e) => setForm({ ...form, alwaysRequireApproval: e.target.checked })}
              />
              Sempre aguardar minha aprovação
            </label>
            <p className="text-xs text-ink-500">
              {form.alwaysRequireApproval
                ? 'Todo conteúdo gerado fica em revisão — nada é publicado sozinho.'
                : 'O Piloto tenta publicar sozinho quando Instagram, permissões e infraestrutura permitirem. Se algum requisito faltar, cai em segurança para revisão manual — nunca perde o conteúdo.'}
            </p>
          </div>

          {canConfigure && (
            <Button onClick={() => saveMutation.mutate(scheduleWeekdays)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando…' : 'Salvar configurações'}
            </Button>
          )}
          {saveMutation.isError && <p className="text-sm text-danger-500">{(saveMutation.error as Error).message}</p>}

          {readiness && !readiness.ready && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">Falta para ativar:</p>
              <ul className="mt-1 list-disc pl-5">
                {readiness.missing.map((m) => (
                  <li key={m}>{MISSING_LABEL[m] ?? m}</li>
                ))}
              </ul>
            </div>
          )}
          {activateMutation.isError && <p className="text-sm text-danger-500">{(activateMutation.error as Error).message}</p>}
        </CardContent>
      </Card>

      {/* ── Plano atual ── */}
      {settings?.status === 'active' && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-ink-900 dark:text-ink-50">Plano atual</h2>
              {!plan || plan.status === 'cancelled' || plan.status === 'completed' ? (
                <Button size="sm" onClick={() => generatePlanMutation.mutate()} disabled={generatePlanMutation.isPending}>
                  {generatePlanMutation.isPending ? 'Gerando plano…' : 'Gerar plano'}
                </Button>
              ) : (
                canConfigure && (
                  <Button size="sm" variant="outline" onClick={() => cancelPlanMutation.mutate(plan.id)} disabled={cancelPlanMutation.isPending}>
                    Regenerar
                  </Button>
                )
              )}
            </div>
            {generatePlanMutation.isError && <p className="text-sm text-danger-500">{(generatePlanMutation.error as Error).message}</p>}

            {plan && plan.status !== 'cancelled' && (
              <>
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Badge variant="brand">{PLAN_STATUS_LABEL[plan.status]}</Badge>
                  <span>
                    {plan.period_start} → {plan.period_end}
                  </span>
                </div>

                {plan.status === 'awaiting_approval' && canApprove && (
                  <Button onClick={() => approvePlanMutation.mutate(plan.id)} disabled={approvePlanMutation.isPending}>
                    Aprovar plano
                  </Button>
                )}
                {plan.status === 'approved' && canConfigure && (
                  <Button onClick={() => generateContentMutation.mutate(plan.id)} disabled={generateContentMutation.isPending}>
                    {generateContentMutation.isPending ? 'Gerando conteúdos…' : 'Gerar conteúdos'}
                  </Button>
                )}
                {generateContentMutation.isError && <p className="text-sm text-danger-500">{(generateContentMutation.error as Error).message}</p>}
                {generateContentMutation.data?.error === 'insufficient_credits' && (
                  <p className="text-sm text-danger-500">Créditos insuficientes para este lote.</p>
                )}

                <div className="flex flex-col gap-2">
                  {(plan.pilot_plan_items ?? [])
                    .filter((i) => i.status !== 'skipped')
                    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-3 text-sm dark:border-ink-700">
                        <div>
                          <p className="font-medium text-ink-900 dark:text-ink-50">
                            {formatInTimeZone(item.scheduled_for, timezone, { dateStyle: 'short', timeStyle: 'short' })} — {item.topic}
                          </p>
                          <p className="text-xs text-ink-500">
                            {EDITORIAL_ROLE_LABEL[item.editorial_role]} · {item.format} {item.brand_pillar ? `· ${item.brand_pillar}` : ''} {item.radar_opportunity_id ? '· 🔥 Radar' : ''}
                            {(item as { directive?: string | null }).directive ? ` · diretriz: "${(item as { directive?: string | null }).directive}"` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.status === 'generated' ? 'success' : item.status === 'failed' ? 'danger' : 'neutral'}>{ITEM_STATUS_LABEL[item.status]}</Badge>
                          {canEditItems && ['planned', 'approved'].includes(item.status) && (
                            <Button size="sm" variant="ghost" onClick={() => skipItemMutation.mutate(item.id)}>
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
            {(!plan || plan.status === 'cancelled') && <p className="text-sm text-ink-500">Nenhum plano ativo — gere um plano para começar.</p>}
          </CardContent>
        </Card>
      )}

      {((recommendationsQuery.data?.length ?? 0) > 0 || experimentQuery.data) && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="font-medium text-ink-900 dark:text-ink-50">Otimizações</h2>
            <p className="text-sm text-ink-500">
              {recommendationsQuery.data?.length ?? 0} recomendação(ões) disponível(is)
              {experimentQuery.data ? ` · 1 experimento ${EXPERIMENT_STATUS_LABEL[experimentQuery.data.status].toLowerCase()}` : ''}
            </p>
            {experimentQuery.data && (
              <div className="flex items-center justify-between rounded bg-slate-50 p-2 text-sm">
                <span>{experimentQuery.data.hypothesis}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">
                    {experimentQuery.data.actual_sample_size}/{experimentQuery.data.target_sample_size}
                  </Badge>
                  {canConfigure && experimentQuery.data.status === 'active' && (
                    <Button size="sm" variant="ghost" onClick={() => cancelExperimentMutation.mutate(experimentQuery.data!.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
            {(recommendationsQuery.data?.length ?? 0) > 0 && (
              <Link to="/relatorios" className="text-sm text-blue-600 underline">
                Ver recomendações em Performance
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Histórico de execuções ── */}
      {(runsQuery.data?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-5">
            <h2 className="font-medium text-ink-900 dark:text-ink-50">Histórico</h2>
            {runsQuery.data!.map((run) => (
              <p key={run.id} className="text-xs text-ink-500">
                {formatInTimeZone(run.started_at, timezone, { dateStyle: 'short', timeStyle: 'short' })} · {run.run_type} · {run.status}
                {run.error_summary ? ` · ${run.error_summary}` : ''}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
