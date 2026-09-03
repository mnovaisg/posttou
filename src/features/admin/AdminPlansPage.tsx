import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminPlans,
  fetchPlanChangeHistory,
  applyPlanPriceChanges,
  renameAdminPlan,
  restorePlanChange,
  applyRounding,
  formatCentsBRL,
  CHANGE_TYPE_LABEL,
  type AdminPlan,
  type RoundingRule,
  type PlanChangeHistoryRow,
} from '@/features/admin/plansApi'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function diffLabel(oldCents: number, newCents: number): { diffCents: number; diffPercent: number } {
  const diffCents = newCents - oldCents
  const diffPercent = oldCents > 0 ? (diffCents / oldCents) * 100 : 0
  return { diffCents, diffPercent }
}

function reaisToCents(input: string): number | null {
  const normalized = input.replace(/\./g, '').replace(',', '.').trim()
  if (!normalized) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

// Regra comercial explícita (pedido do usuário): novos valores só valem
// para novas contratações e futuras mudanças de plano — nunca reajustam
// silenciosamente quem permanece no plano atual. Mesmo texto no aviso
// fixo do topo e em toda prévia de confirmação de preço.
const PRICE_CHANGE_SCOPE_WARNING =
  'Os novos valores serão aplicados a novas contratações e futuras mudanças de plano. Assinaturas existentes que permanecerem no plano atual continuarão com o valor contratado no Asaas.'

const ROUNDING_LABEL: Record<RoundingRule, string> = {
  exact: 'Exato',
  integer: 'Inteiro',
  commercial_9: 'Comercial (final 9)',
}

type EditTab = 'direct' | 'percent'
type PercentTarget = 'monthly' | 'yearly' | 'both'

interface EditorState {
  tab: EditTab
  monthlyInput: string
  yearlyInput: string
  percentValue: string
  percentDirection: '+' | '-'
  percentTarget: PercentTarget
  roundingRule: RoundingRule
  annualCalcMode: 'free_months' | 'percent_discount'
  annualCalcValue: string
  note: string
}

function defaultEditorState(plan: AdminPlan): EditorState {
  return {
    tab: 'direct',
    monthlyInput: centsToReaisInput(plan.price_monthly_cents),
    yearlyInput: centsToReaisInput(plan.price_yearly_cents),
    percentValue: '10',
    percentDirection: '+',
    percentTarget: 'both',
    roundingRule: 'exact',
    annualCalcMode: 'free_months',
    annualCalcValue: '2',
    note: '',
  }
}

interface BulkState {
  open: boolean
  percentValue: string
  percentDirection: '+' | '-'
  percentTarget: PercentTarget
  roundingRule: RoundingRule
  note: string
  preview: { plan_id: string; name: string; oldMonthly: number; newMonthly: number | null; oldYearly: number; newYearly: number | null } [] | null
}

function defaultBulkState(): BulkState {
  return {
    open: false,
    percentValue: '10',
    percentDirection: '+',
    percentTarget: 'both',
    roundingRule: 'exact',
    note: '',
    preview: null,
  }
}

export function AdminPlansPage() {
  const queryClient = useQueryClient()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const plansQuery = useQuery({ queryKey: ['admin-plans'], queryFn: fetchAdminPlans })
  const historyQuery = useQuery({ queryKey: ['admin-plan-history', null], queryFn: () => fetchPlanChangeHistory(null, 100) })

  const [openPlanId, setOpenPlanId] = React.useState<string | null>(null)
  const [editor, setEditor] = React.useState<EditorState | null>(null)
  const [directPreview, setDirectPreview] = React.useState<{ monthly?: ReturnType<typeof diffLabel>; yearly?: ReturnType<typeof diffLabel> } | null>(null)
  const [percentPreview, setPercentPreview] = React.useState<{ newMonthly: number | null; newYearly: number | null } | null>(null)

  const [renamingPlanId, setRenamingPlanId] = React.useState<string | null>(null)
  const [nameInput, setNameInput] = React.useState('')

  const [bulk, setBulk] = React.useState<BulkState>(defaultBulkState())

  const [restoringId, setRestoringId] = React.useState<string | null>(null)

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['admin-plans'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-plan-history'] })
    await queryClient.invalidateQueries({ queryKey: ['landing-plans'] })
    await queryClient.invalidateQueries({ queryKey: ['billing-plans'] })
  }

  function openEditor(plan: AdminPlan) {
    setOpenPlanId(plan.id)
    setEditor(defaultEditorState(plan))
    setDirectPreview(null)
    setPercentPreview(null)
    setError(null)
  }

  function closeEditor() {
    setOpenPlanId(null)
    setEditor(null)
    setDirectPreview(null)
    setPercentPreview(null)
  }

  const openPlan = plansQuery.data?.find((p) => p.id === openPlanId) ?? null

  function computeDirectPreview() {
    if (!openPlan || !editor) return
    const newMonthly = reaisToCents(editor.monthlyInput)
    const newYearly = reaisToCents(editor.yearlyInput)
    const preview: { monthly?: ReturnType<typeof diffLabel>; yearly?: ReturnType<typeof diffLabel> } = {}
    if (newMonthly !== null && newMonthly !== openPlan.price_monthly_cents) preview.monthly = diffLabel(openPlan.price_monthly_cents, newMonthly)
    if (newYearly !== null && newYearly !== openPlan.price_yearly_cents) preview.yearly = diffLabel(openPlan.price_yearly_cents, newYearly)
    setDirectPreview(preview)
  }

  async function confirmDirectChange() {
    if (!openPlan || !editor) return
    const newMonthly = reaisToCents(editor.monthlyInput)
    const newYearly = reaisToCents(editor.yearlyInput)
    setBusy(true)
    setError(null)
    try {
      await applyPlanPriceChanges(
        [{ plan_id: openPlan.id, new_monthly_cents: newMonthly, new_yearly_cents: newYearly }],
        'price_manual',
        null,
        null,
        editor.note.trim() || null,
      )
      await refreshAll()
      closeEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  function computePercentPreview() {
    if (!openPlan || !editor) return
    const pct = Number(editor.percentValue.replace(',', '.'))
    if (!Number.isFinite(pct) || pct <= 0) {
      setError('Informe um percentual válido.')
      return
    }
    const signedPct = editor.percentDirection === '+' ? pct : -pct
    const applyTo = (cents: number) => applyRounding(cents * (1 + signedPct / 100), editor.roundingRule)
    setPercentPreview({
      newMonthly: editor.percentTarget !== 'yearly' ? applyTo(openPlan.price_monthly_cents) : null,
      newYearly: editor.percentTarget !== 'monthly' ? applyTo(openPlan.price_yearly_cents) : null,
    })
    setError(null)
  }

  async function confirmPercentChange() {
    if (!openPlan || !editor || !percentPreview) return
    const pct = Number(editor.percentValue.replace(',', '.'))
    const signedPct = editor.percentDirection === '+' ? pct : -pct
    setBusy(true)
    setError(null)
    try {
      await applyPlanPriceChanges(
        [{ plan_id: openPlan.id, new_monthly_cents: percentPreview.newMonthly, new_yearly_cents: percentPreview.newYearly }],
        'price_percent',
        signedPct,
        editor.roundingRule,
        editor.note.trim() || null,
      )
      await refreshAll()
      closeEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  function applyAnnualCalc() {
    if (!editor) return
    const monthlyCents = reaisToCents(editor.monthlyInput)
    if (monthlyCents === null) {
      setError('Informe um valor mensal válido antes de calcular o anual.')
      return
    }
    const calcValue = Number(editor.annualCalcValue.replace(',', '.'))
    if (!Number.isFinite(calcValue) || calcValue < 0) {
      setError('Informe um valor válido para o cálculo.')
      return
    }
    let yearlyCents: number
    if (editor.annualCalcMode === 'free_months') {
      const chargedMonths = Math.max(0, 12 - calcValue)
      yearlyCents = Math.round(monthlyCents * chargedMonths)
    } else {
      yearlyCents = Math.round(monthlyCents * 12 * (1 - calcValue / 100))
    }
    yearlyCents = applyRounding(yearlyCents, editor.roundingRule)
    setEditor({ ...editor, yearlyInput: centsToReaisInput(yearlyCents) })
    setError(null)
  }

  // Renomear plano
  function openRename(plan: AdminPlan) {
    setRenamingPlanId(plan.id)
    setNameInput(plan.name)
    setError(null)
  }

  async function confirmRename() {
    if (!renamingPlanId) return
    setBusy(true)
    setError(null)
    try {
      await renameAdminPlan(renamingPlanId, nameInput.trim(), null)
      await refreshAll()
      setRenamingPlanId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  // Ajuste em massa
  function computeBulkPreview() {
    if (!plansQuery.data) return
    const pct = Number(bulk.percentValue.replace(',', '.'))
    if (!Number.isFinite(pct) || pct <= 0) {
      setError('Informe um percentual válido.')
      return
    }
    const signedPct = bulk.percentDirection === '+' ? pct : -pct
    const applyTo = (cents: number) => applyRounding(cents * (1 + signedPct / 100), bulk.roundingRule)
    setBulk({
      ...bulk,
      preview: plansQuery.data.map((p) => ({
        plan_id: p.id,
        name: p.name,
        oldMonthly: p.price_monthly_cents,
        newMonthly: bulk.percentTarget !== 'yearly' ? applyTo(p.price_monthly_cents) : null,
        oldYearly: p.price_yearly_cents,
        newYearly: bulk.percentTarget !== 'monthly' ? applyTo(p.price_yearly_cents) : null,
      })),
    })
    setError(null)
  }

  async function confirmBulkChange() {
    if (!bulk.preview) return
    const pct = Number(bulk.percentValue.replace(',', '.'))
    const signedPct = bulk.percentDirection === '+' ? pct : -pct
    setBusy(true)
    setError(null)
    try {
      await applyPlanPriceChanges(
        bulk.preview.map((p) => ({ plan_id: p.plan_id, new_monthly_cents: p.newMonthly, new_yearly_cents: p.newYearly })),
        'price_bulk',
        signedPct,
        bulk.roundingRule,
        bulk.note.trim() || null,
      )
      await refreshAll()
      setBulk(defaultBulkState())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore(historyId: string) {
    setBusy(true)
    setError(null)
    try {
      await restorePlanChange(historyId, null)
      await refreshAll()
      setRestoringId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Planos & Preços</h1>
        <p className="mt-1 text-sm text-ink-500">Fonte oficial de preços do POSTTOU — reflete automaticamente na Landing, Billing e checkout.</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {PRICE_CHANGE_SCOPE_WARNING}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {plansQuery.isLoading && <p className="text-sm text-ink-400">Carregando…</p>}
      {plansQuery.isError && <p className="text-sm text-danger-500">Não foi possível carregar os planos.</p>}

      {/* Ajuste em massa */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-ink-900 dark:text-ink-50"
          onClick={() => setBulk((b) => ({ ...defaultBulkState(), open: !b.open }))}
        >
          Ajustar todos os planos
          <span className="text-xs font-normal text-ink-400">{bulk.open ? 'Fechar' : 'Abrir'}</span>
        </button>

        {bulk.open && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-ink-500">
                Direção
                <select
                  className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                  value={bulk.percentDirection}
                  onChange={(e) => setBulk({ ...bulk, percentDirection: e.target.value as '+' | '-', preview: null })}
                >
                  <option value="+">Aumentar (+)</option>
                  <option value="-">Reduzir (-)</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-ink-500">
                Percentual
                <input
                  className="mt-1 w-24 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                  value={bulk.percentValue}
                  onChange={(e) => setBulk({ ...bulk, percentValue: e.target.value, preview: null })}
                />
              </label>
              <label className="flex flex-col text-xs text-ink-500">
                Aplicar em
                <select
                  className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                  value={bulk.percentTarget}
                  onChange={(e) => setBulk({ ...bulk, percentTarget: e.target.value as PercentTarget, preview: null })}
                >
                  <option value="monthly">Somente mensal</option>
                  <option value="yearly">Somente anual</option>
                  <option value="both">Mensal e anual</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-ink-500">
                Arredondamento
                <select
                  className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                  value={bulk.roundingRule}
                  onChange={(e) => setBulk({ ...bulk, roundingRule: e.target.value as RoundingRule, preview: null })}
                >
                  {(Object.keys(ROUNDING_LABEL) as RoundingRule[]).map((r) => (
                    <option key={r} value={r}>
                      {ROUNDING_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200"
                onClick={computeBulkPreview}
              >
                Calcular prévia
              </button>
            </div>

            {bulk.preview && (
              <div className="rounded-lg border border-ink-100 dark:border-ink-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-50 text-ink-400 dark:bg-ink-950">
                    <tr>
                      <th className="px-3 py-2">Plano</th>
                      <th className="px-3 py-2">Mensal: antes → depois</th>
                      <th className="px-3 py-2">Anual: antes → depois</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                    {bulk.preview.map((p) => (
                      <tr key={p.plan_id}>
                        <td className="px-3 py-2 font-medium text-ink-900 dark:text-ink-50">{p.name}</td>
                        <td className="px-3 py-2 text-ink-600 dark:text-ink-300">
                          {p.newMonthly !== null ? (
                            <>
                              {formatCentsBRL(p.oldMonthly)} → <strong className="text-green-700 dark:text-green-400">{formatCentsBRL(p.newMonthly)}</strong>
                            </>
                          ) : (
                            <span className="text-ink-400">sem alteração</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-600 dark:text-ink-300">
                          {p.newYearly !== null ? (
                            <>
                              {formatCentsBRL(p.oldYearly)} → <strong className="text-green-700 dark:text-green-400">{formatCentsBRL(p.newYearly)}</strong>
                            </>
                          ) : (
                            <span className="text-ink-400">sem alteração</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-ink-100 px-3 pt-3 text-xs text-amber-800 dark:border-ink-800 dark:text-amber-300">{PRICE_CHANGE_SCOPE_WARNING}</p>
                <div className="flex items-center gap-2 p-3 pt-2">
                  <input
                    className="flex-1 rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-700 dark:bg-ink-950"
                    placeholder="Nota (opcional)"
                    value={bulk.note}
                    onChange={(e) => setBulk({ ...bulk, note: e.target.value })}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={confirmBulkChange}
                  >
                    Confirmar novos preços
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                    onClick={() => setBulk({ ...bulk, preview: null })}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cards de plano */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plansQuery.data?.map((plan) => {
          const monthlyEquivalent = Math.round(plan.price_yearly_cents / 12)
          const savings = plan.price_monthly_cents * 12 - plan.price_yearly_cents
          const isOpen = openPlanId === plan.id
          const isRenaming = renamingPlanId === plan.id

          return (
            <div key={plan.id} className="flex flex-col rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-start justify-between gap-2">
                {isRenaming ? (
                  <div className="flex-1">
                    <p className="text-xs text-ink-400">Nome atual: {plan.name}</p>
                    <input
                      className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-ink-500">Novo nome: {nameInput.trim() || '—'}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                        disabled={busy || !nameInput.trim()}
                        onClick={confirmRename}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                        onClick={() => setRenamingPlanId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{plan.name}</h2>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        plan.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                      }`}
                    >
                      {plan.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                )}
                {!isRenaming && (
                  <button type="button" className="shrink-0 text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-200" onClick={() => openRename(plan)}>
                    Renomear
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-1 text-sm">
                <p className="text-ink-900 dark:text-ink-50">
                  <span className="text-2xl font-semibold">{formatCentsBRL(plan.price_monthly_cents)}</span>
                  <span className="text-xs text-ink-400">/mês</span>
                </p>
                <p className="text-xs text-ink-500">
                  Anual: {formatCentsBRL(plan.price_yearly_cents)} ({formatCentsBRL(monthlyEquivalent)}/mês equiv.)
                </p>
                {savings > 0 && <p className="text-xs text-green-700 dark:text-green-400">Economia anual: {formatCentsBRL(savings)}</p>}
              </div>

              <div className="mt-2 text-xs text-ink-400">
                <p>Última alteração de preço: {formatDate(plan.last_price_change_at)}</p>
                <p>Última alteração de nome: {formatDate(plan.last_name_change_at)}</p>
              </div>

              <button
                type="button"
                className="mt-3 rounded-lg border border-ink-200 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200"
                onClick={() => (isOpen ? closeEditor() : openEditor(plan))}
              >
                {isOpen ? 'Fechar edição' : 'Editar preços'}
              </button>

              {isOpen && editor && openPlan && (
                <div className="mt-3 flex flex-col gap-3 border-t border-ink-100 pt-3 dark:border-ink-800">
                  <div className="flex gap-1 rounded-lg border border-ink-200 p-0.5 text-xs dark:border-ink-700">
                    <button
                      type="button"
                      className={`flex-1 rounded-md py-1 font-medium ${editor.tab === 'direct' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'}`}
                      onClick={() => {
                        setEditor({ ...editor, tab: 'direct' })
                        setPercentPreview(null)
                      }}
                    >
                      Valor direto
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-md py-1 font-medium ${editor.tab === 'percent' ? 'bg-brand-600 text-white' : 'text-ink-600 dark:text-ink-300'}`}
                      onClick={() => {
                        setEditor({ ...editor, tab: 'percent' })
                        setDirectPreview(null)
                      }}
                    >
                      Percentual
                    </button>
                  </div>

                  {editor.tab === 'direct' && (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col text-xs text-ink-500">
                        Mensal (R$)
                        <input
                          className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                          value={editor.monthlyInput}
                          onChange={(e) => {
                            setEditor({ ...editor, monthlyInput: e.target.value })
                            setDirectPreview(null)
                          }}
                        />
                      </label>
                      <label className="flex flex-col text-xs text-ink-500">
                        Anual (R$)
                        <input
                          className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                          value={editor.yearlyInput}
                          onChange={(e) => {
                            setEditor({ ...editor, yearlyInput: e.target.value })
                            setDirectPreview(null)
                          }}
                        />
                      </label>

                      <div className="rounded-lg bg-ink-50 p-2 text-xs dark:bg-ink-950">
                        <p className="font-medium text-ink-700 dark:text-ink-200">Recalcular anual a partir do mensal</p>
                        <div className="mt-1 flex flex-wrap items-end gap-2">
                          <select
                            className="rounded-lg border border-ink-200 px-2 py-1 dark:border-ink-700 dark:bg-ink-900"
                            value={editor.annualCalcMode}
                            onChange={(e) => setEditor({ ...editor, annualCalcMode: e.target.value as 'free_months' | 'percent_discount' })}
                          >
                            <option value="free_months">Meses grátis</option>
                            <option value="percent_discount">Desconto anual (%)</option>
                          </select>
                          <input
                            className="w-20 rounded-lg border border-ink-200 px-2 py-1 dark:border-ink-700 dark:bg-ink-900"
                            value={editor.annualCalcValue}
                            onChange={(e) => setEditor({ ...editor, annualCalcValue: e.target.value })}
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-ink-300 px-2 py-1 font-medium text-ink-700 dark:border-ink-600 dark:text-ink-200"
                            onClick={applyAnnualCalc}
                          >
                            Calcular
                          </button>
                        </div>
                        <p className="mt-1 text-ink-400">Só preenche o campo anual acima — não salva sozinho.</p>
                      </div>

                      <label className="flex flex-col text-xs text-ink-500">
                        Arredondamento
                        <select
                          className="mt-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                          value={editor.roundingRule}
                          onChange={(e) => setEditor({ ...editor, roundingRule: e.target.value as RoundingRule })}
                        >
                          {(Object.keys(ROUNDING_LABEL) as RoundingRule[]).map((r) => (
                            <option key={r} value={r}>
                              {ROUNDING_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="rounded-lg border border-ink-200 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200"
                        onClick={computeDirectPreview}
                      >
                        Ver prévia
                      </button>

                      {directPreview && (Object.keys(directPreview).length > 0 ? (
                        <div className="rounded-lg border border-ink-200 p-2 text-xs dark:border-ink-700">
                          {directPreview.monthly && (
                            <p>
                              Mensal: {formatCentsBRL(openPlan.price_monthly_cents)} → {formatCentsBRL(openPlan.price_monthly_cents + directPreview.monthly.diffCents)}{' '}
                              ({directPreview.monthly.diffCents >= 0 ? '+' : ''}
                              {formatCentsBRL(directPreview.monthly.diffCents)}, {directPreview.monthly.diffPercent.toFixed(1)}%)
                            </p>
                          )}
                          {directPreview.yearly && (
                            <p>
                              Anual: {formatCentsBRL(openPlan.price_yearly_cents)} → {formatCentsBRL(openPlan.price_yearly_cents + directPreview.yearly.diffCents)} (
                              {directPreview.yearly.diffCents >= 0 ? '+' : ''}
                              {formatCentsBRL(directPreview.yearly.diffCents)}, {directPreview.yearly.diffPercent.toFixed(1)}%)
                            </p>
                          )}
                          <p className="mt-2 text-amber-800 dark:text-amber-300">{PRICE_CHANGE_SCOPE_WARNING}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg bg-brand-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                              disabled={busy}
                              onClick={confirmDirectChange}
                            >
                              Confirmar novos preços
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-ink-200 px-2.5 py-1 font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                              onClick={() => setDirectPreview(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-400">Nenhuma alteração em relação ao valor atual.</p>
                      ))}
                    </div>
                  )}

                  {editor.tab === 'percent' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                          value={editor.percentDirection}
                          onChange={(e) => {
                            setEditor({ ...editor, percentDirection: e.target.value as '+' | '-' })
                            setPercentPreview(null)
                          }}
                        >
                          <option value="+">Aumentar (+)</option>
                          <option value="-">Reduzir (-)</option>
                        </select>
                        <input
                          className="w-20 rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                          value={editor.percentValue}
                          onChange={(e) => {
                            setEditor({ ...editor, percentValue: e.target.value })
                            setPercentPreview(null)
                          }}
                        />
                        <span className="self-center text-sm text-ink-500">%</span>
                      </div>
                      <select
                        className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                        value={editor.percentTarget}
                        onChange={(e) => {
                          setEditor({ ...editor, percentTarget: e.target.value as PercentTarget })
                          setPercentPreview(null)
                        }}
                      >
                        <option value="monthly">Somente mensal</option>
                        <option value="yearly">Somente anual</option>
                        <option value="both">Mensal e anual</option>
                      </select>
                      <select
                        className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                        value={editor.roundingRule}
                        onChange={(e) => setEditor({ ...editor, roundingRule: e.target.value as RoundingRule })}
                      >
                        {(Object.keys(ROUNDING_LABEL) as RoundingRule[]).map((r) => (
                          <option key={r} value={r}>
                            {ROUNDING_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded-lg border border-ink-200 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200"
                        onClick={computePercentPreview}
                      >
                        Ver prévia
                      </button>

                      {percentPreview && (
                        <div className="rounded-lg border border-ink-200 p-2 text-xs dark:border-ink-700">
                          {percentPreview.newMonthly !== null && (
                            <p>
                              Mensal: {formatCentsBRL(openPlan.price_monthly_cents)} → <strong>{formatCentsBRL(percentPreview.newMonthly)}</strong>
                            </p>
                          )}
                          {percentPreview.newYearly !== null && (
                            <p>
                              Anual: {formatCentsBRL(openPlan.price_yearly_cents)} → <strong>{formatCentsBRL(percentPreview.newYearly)}</strong>
                            </p>
                          )}
                          <p className="mt-2 text-amber-800 dark:text-amber-300">{PRICE_CHANGE_SCOPE_WARNING}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg bg-brand-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                              disabled={busy}
                              onClick={confirmPercentChange}
                            >
                              Confirmar novos preços
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-ink-200 px-2.5 py-1 font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300"
                              onClick={() => setPercentPreview(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Histórico */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Histórico de alterações</h2>
        {historyQuery.isLoading && <p className="text-sm text-ink-400">Carregando…</p>}
        <div className="flex flex-col gap-2">
          {historyQuery.data?.map((h: PlanChangeHistoryRow) => (
            <div key={h.id} className="rounded-lg border border-ink-200 bg-white p-3 text-xs dark:border-ink-800 dark:bg-ink-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink-900 dark:text-ink-50">
                  {h.plan_id} · {CHANGE_TYPE_LABEL[h.change_type]}
                </span>
                <span className="text-ink-400">
                  {formatDate(h.created_at)} · {h.admin_display_name ?? h.admin_user_id}
                </span>
              </div>
              <p className="mt-1 text-ink-600 dark:text-ink-300">
                {h.field === 'name' ? (
                  <>
                    {h.previous_name} → {h.new_name}
                  </>
                ) : (
                  <>
                    {h.previous_monthly_cents !== null && (
                      <>
                        Mensal: {formatCentsBRL(h.previous_monthly_cents)} → {formatCentsBRL(h.new_monthly_cents!)}{' '}
                      </>
                    )}
                    {h.previous_yearly_cents !== null && (
                      <>
                        Anual: {formatCentsBRL(h.previous_yearly_cents)} → {formatCentsBRL(h.new_yearly_cents!)}
                      </>
                    )}
                    {h.percent_applied !== null && <> ({h.percent_applied > 0 ? '+' : ''}{h.percent_applied}%)</>}
                  </>
                )}
                {h.note && <span className="text-ink-400"> — {h.note}</span>}
              </p>
              {!h.change_type.endsWith('restore') && (
                <div className="mt-1">
                  {restoringId === h.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-ink-500">Restaurar este valor?</span>
                      <button
                        type="button"
                        className="rounded-lg bg-amber-600 px-2 py-0.5 font-medium text-white disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleRestore(h.id)}
                      >
                        Confirmar
                      </button>
                      <button type="button" className="text-ink-500" onClick={() => setRestoringId(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="text-brand-600 hover:underline dark:text-brand-400" onClick={() => setRestoringId(h.id)}>
                      Restaurar {h.field === 'name' ? 'este nome' : 'estes preços'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {historyQuery.data?.length === 0 && <p className="text-sm text-ink-400">Nenhuma alteração registrada ainda.</p>}
        </div>
      </div>
    </div>
  )
}
