import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  COMMERCIAL_STATUS_COLOR,
  COMMERCIAL_STATUS_LABEL,
  FOLLOW_UP_ACTION_LABEL,
  addAdminLeadFollowUp,
  addAdminLeadNote,
  completeAdminLeadFollowUp,
  fetchAdminLeadDetail,
  setAdminLeadTags,
} from '@/features/admin/api'

function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}
function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—'
}

export function AdminLeadDetailPage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const queryClient = useQueryClient()
  const [noteBody, setNoteBody] = React.useState('')
  const [tagInput, setTagInput] = React.useState('')
  const [followUpType, setFollowUpType] = React.useState('contact')
  const [followUpDate, setFollowUpDate] = React.useState('')
  const [followUpNote, setFollowUpNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['admin-lead-detail', organizationId],
    queryFn: () => fetchAdminLeadDetail(organizationId!),
    enabled: !!organizationId,
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-lead-detail', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteBody.trim() || !organizationId) return
    setBusy(true)
    setError(null)
    try {
      await addAdminLeadNote(organizationId, noteBody.trim())
      setNoteBody('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar nota.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault()
    if (!tagInput.trim() || !organizationId || !detailQuery.data) return
    setBusy(true)
    setError(null)
    try {
      const next = Array.from(new Set([...detailQuery.data.tags, tagInput.trim()]))
      await setAdminLeadTags(organizationId, next)
      setTagInput('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar tag.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveTag(tag: string) {
    if (!organizationId || !detailQuery.data) return
    setBusy(true)
    try {
      await setAdminLeadTags(organizationId, detailQuery.data.tags.filter((t) => t !== tag))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleAddFollowUp(e: React.FormEvent) {
    e.preventDefault()
    if (!organizationId) return
    setBusy(true)
    setError(null)
    try {
      await addAdminLeadFollowUp(organizationId, followUpType, followUpDate || null, followUpNote || null)
      setFollowUpDate('')
      setFollowUpNote('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar follow-up.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCompleteFollowUp(id: string) {
    setBusy(true)
    try {
      await completeAdminLeadFollowUp(id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (detailQuery.isLoading) return <p className="text-sm text-ink-400">Carregando…</p>
  if (detailQuery.isError || !detailQuery.data) return <p className="text-sm text-danger-500">Lead não encontrado.</p>

  const d = detailQuery.data

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/clientes" className="text-sm text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
        ← Clientes & Leads
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">{d.identification.full_name ?? d.identification.email}</h1>
          <p className="mt-1 text-sm text-ink-500">{d.identification.email}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${COMMERCIAL_STATUS_COLOR[d.commercial_status]}`}>
          {COMMERCIAL_STATUS_LABEL[d.commercial_status]}
        </span>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {/* Origem — bem visível, como pedido */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Origem</h2>
        {d.attribution ? (
          <div className="mt-2 flex flex-col gap-1 text-sm text-brand-900 dark:text-brand-200">
            {d.attribution.utm_source && <p>Origem: <span className="font-medium">{d.attribution.utm_source}</span>{d.attribution.utm_medium ? ` (${d.attribution.utm_medium})` : ''}</p>}
            {d.attribution.utm_campaign && <p>Campanha: <span className="font-medium">{d.attribution.utm_campaign}</span></p>}
            {d.attribution.coupon_code_at_signup && <p>Cupom de entrada: <span className="font-mono font-medium">{d.attribution.coupon_code_at_signup}</span></p>}
            <p className="text-xs text-brand-700/80 dark:text-brand-400">Capturado em {formatDateTime(d.attribution.captured_at)}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-800 dark:text-brand-300">Sem atribuição registrada (cadastro direto, sem UTM/cupom capturado).</p>
        )}
        <p className="mt-2 text-sm text-brand-900 dark:text-brand-200">Cadastro: <span className="font-medium">{formatDate(d.identification.signed_up_at)}</span></p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Identificação */}
        <Section title="Identificação">
          <Field label="Nome" value={d.identification.full_name} />
          <Field label="E-mail" value={d.identification.email} />
          <Field label="WhatsApp" value={d.identification.whatsapp ?? 'Não informado'} />
          <Field label="Instagram" value={d.identification.instagram ? `@${d.identification.instagram}` : '—'} />
          <Field label="Empresa/marca" value={d.identification.company_name} />
          <Field label="E-mail confirmado" value={formatDateTime(d.identification.email_confirmed_at)} />
          <Field label="Último login" value={formatDateTime(d.identification.last_sign_in_at)} />
          {d.identification.deleted_at && <Field label="Conta excluída em" value={formatDateTime(d.identification.deleted_at)} />}
        </Section>

        {/* Assinatura */}
        <Section title="Assinatura">
          <Field label="Plano" value={d.subscription.plan_name ?? '—'} />
          <Field label="Ciclo" value={d.subscription.billing_interval === 'monthly' ? 'Mensal' : d.subscription.billing_interval === 'yearly' ? 'Anual' : '—'} />
          <Field label="Status bruto" value={d.subscription.status} />
          <Field label="Trial até" value={formatDateTime(d.subscription.trial_ends_at)} />
          <Field label="Ativado em" value={formatDateTime(d.subscription.activated_at)} />
          <Field label="Período atual" value={d.subscription.current_period_start ? `${formatDate(d.subscription.current_period_start)} — ${formatDate(d.subscription.current_period_end)}` : '—'} />
          {d.subscription.cancel_at_period_end && <Field label="Cancelamento" value="Agendado para o fim do período" />}
          {d.subscription.past_due_since && <Field label="Em atraso desde" value={formatDate(d.subscription.past_due_since)} />}
          <Field label="Preço mensal" value={formatCents(d.subscription.price_monthly_cents)} />
          <Field label="Preço anual" value={formatCents(d.subscription.price_yearly_cents)} />
        </Section>

        {/* Financeiro */}
        <Section title="Financeiro (cupons/descontos aplicados)">
          {d.financial.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum cupom utilizado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {d.financial.map((f, i) => (
                <div key={i} className="rounded-lg border border-ink-100 p-2 text-xs dark:border-ink-800">
                  <p className="font-mono font-medium text-ink-800 dark:text-ink-100">{f.coupon_code}</p>
                  <p className="text-ink-500">{formatCents(f.original_amount_cents)} → {formatCents(f.final_amount_cents)} ({f.status})</p>
                  <p className="text-ink-400">{formatDateTime(f.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Produto */}
        <Section title="Produto">
          <Field label="Créditos disponíveis" value={d.product.credits_balance ?? '—'} />
          <Field label="DNA criado" value={d.product.dna_completed ? 'Sim' : 'Não'} />
          <Field label="Instagram conectado" value={d.product.instagram_connected ? 'Sim' : 'Não'} />
          <Field label="Conteúdos criados" value={d.product.contents_count} />
          <Field label="Última atividade" value={formatDateTime(d.product.last_activity_at)} />
        </Section>

        {/* Consentimento de marketing */}
        <Section title="Consentimento de marketing">
          <Field label="E-mail" value={d.marketing_consent.email ? (d.marketing_consent.email.opted_in ? `Sim (desde ${formatDate(d.marketing_consent.email.changed_at)})` : `Não (desde ${formatDate(d.marketing_consent.email.changed_at)})`) : 'Nunca respondido'} />
          <Field label="WhatsApp" value={d.marketing_consent.whatsapp ? (d.marketing_consent.whatsapp.opted_in ? `Sim (desde ${formatDate(d.marketing_consent.whatsapp.changed_at)})` : `Não (desde ${formatDate(d.marketing_consent.whatsapp.changed_at)})`) : 'Nunca respondido'} />
          <p className="mt-2 text-xs text-ink-400">Consentimento é sempre separado do status comercial — ser lead/cliente nunca autoriza campanha por si só.</p>
        </Section>

        {/* Jornada */}
        <Section title="Jornada">
          {d.journey.length === 0 ? (
            <p className="text-sm text-ink-400">Sem transições de status registradas ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-xs">
              {d.journey.map((j, i) => (
                <li key={i} className="border-l-2 border-brand-300 pl-2 dark:border-brand-800">
                  <span className="font-medium text-ink-800 dark:text-ink-100">{j.from_status ?? '—'} → {j.to_status}</span>
                  <span className="ml-2 text-ink-400">({j.reason})</span>
                  <p className="text-ink-400">{formatDateTime(j.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap gap-2">
          {d.tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200">
              {t}
              <button type="button" onClick={() => handleRemoveTag(t)} disabled={busy} className="text-ink-400 hover:text-danger-500">×</button>
            </span>
          ))}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={handleAddTag}>
          <input
            className="flex-1 rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            placeholder="Nova tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <button type="submit" disabled={busy || !tagInput.trim()} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-ink-700">
            Adicionar
          </button>
        </form>
      </Section>

      {/* Follow-up */}
      <Section title="Próxima ação / follow-up">
        <div className="flex flex-col gap-2">
          {d.follow_ups.length === 0 && <p className="text-sm text-ink-400">Nenhum follow-up registrado.</p>}
          {d.follow_ups.map((f) => (
            <div key={f.id} className={`flex items-center justify-between rounded-lg border p-2 text-xs ${f.status === 'done' ? 'border-ink-100 opacity-60 dark:border-ink-800' : 'border-amber-200 dark:border-amber-900'}`}>
              <div>
                <p className="font-medium text-ink-800 dark:text-ink-100">{FOLLOW_UP_ACTION_LABEL[f.action_type] ?? f.action_type} {f.due_at && <>— {formatDate(f.due_at)}</>}</p>
                {f.note && <p className="text-ink-500">{f.note}</p>}
                <p className="text-ink-400">{f.status === 'done' ? `Concluído em ${formatDateTime(f.completed_at)}` : `Criado em ${formatDateTime(f.created_at)}`}</p>
              </div>
              {f.status === 'open' && (
                <button type="button" onClick={() => handleCompleteFollowUp(f.id)} disabled={busy} className="shrink-0 rounded-lg border border-ink-200 px-2 py-1 font-medium dark:border-ink-700">
                  Concluir
                </button>
              )}
            </div>
          ))}
        </div>
        <form className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3 dark:border-ink-800" onSubmit={handleAddFollowUp}>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
              value={followUpType}
              onChange={(e) => setFollowUpType(e.target.value)}
            >
              {Object.entries(FOLLOW_UP_ACTION_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </div>
          <input
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            placeholder="Observação (opcional)"
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
          <button type="submit" disabled={busy} className="self-start rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Adicionar follow-up
          </button>
        </form>
      </Section>

      {/* Notas administrativas */}
      <Section title="Observações internas">
        <div className="flex flex-col gap-2">
          {d.notes.length === 0 && <p className="text-sm text-ink-400">Nenhuma observação ainda.</p>}
          {d.notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-ink-100 p-2 text-xs dark:border-ink-800">
              <p className="text-ink-700 dark:text-ink-200">{n.body}</p>
              <p className="mt-1 text-ink-400">{n.author_email} · {formatDateTime(n.created_at)}</p>
            </div>
          ))}
        </div>
        <form className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3 dark:border-ink-800" onSubmit={handleAddNote}>
          <textarea
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs dark:border-ink-800 dark:bg-ink-950"
            rows={2}
            placeholder="Nova observação — nunca visível ao cliente"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <button type="submit" disabled={busy || !noteBody.trim()} className="self-start rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Salvar observação
          </button>
        </form>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="min-w-0 shrink text-right font-medium text-ink-800 [overflow-wrap:anywhere] dark:text-ink-100">{value ?? '—'}</span>
    </div>
  )
}
