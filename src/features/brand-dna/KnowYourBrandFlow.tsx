import * as React from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DiscoveryNotConfiguredError, startDiscovery } from '@/features/instagram-discovery/api'
import { DISCOVERY_ERROR_MESSAGES } from '@/features/instagram-discovery/types'
import type { DiscoveryDna, DiscoveryProfileSummary } from '@/features/instagram-discovery/types'
import { mapDiscoveryDnaToBrandProfilePatch } from '@/features/instagram-discovery/mapDnaToBrandProfilePatch'
import { mapAiSuggestionsToBrandProfilePatch } from '@/features/brand-dna/mapAiSuggestionsToBrandProfilePatch'
import type { BrandDnaAiSuggestions } from '@/features/brand-dna/mapAiSuggestionsToBrandProfilePatch'
import type { TablesUpdate } from '@/types/database'
import { consumePendingInstagramHandle } from '@/lib/pendingInstagramHandle'

type Stage = 'handle' | 'loading' | 'description' | 'summary'

type Source =
  | { kind: 'discovery'; handle: string; profile?: DiscoveryProfileSummary; dna: DiscoveryDna }
  | { kind: 'description'; suggestions: BrandDnaAiSuggestions }

/**
 * Ajuste pré-beta — jornada guiada: "Conhecer sua marca" é o passo real
 * inicial do onboarding, não o formulário. Caminho definitivo é
 * @Instagram → instagram-discovery-public-start (Business Discovery real,
 * já existente) → AI Gateway → resumo → aprovação. Enquanto os secrets da
 * Meta não estiverem configurados, degrada silenciosamente (nunca mostra
 * "not_configured"/infra ao usuário) para descrição curta →
 * brand-dna-assist (mesmo AI Gateway compartilhado) → resumo → aprovação.
 * Nenhum Discovery paralelo, nenhum Brand DNA paralelo — os dois caminhos
 * convergem no mesmo mapeamento para os campos reais de brand_profiles.
 */
export function KnowYourBrandFlow({
  workspaceId,
  companyNameFallback,
  onAccept,
  onReview,
}: {
  workspaceId: string
  companyNameFallback: string | null
  /** Usuário confirmou a sugestão — grava e marca o DNA como concluído. */
  onAccept: (patch: TablesUpdate<'brand_profiles'>) => void
  /** Usuário quer revisar campo a campo antes de concluir — grava como rascunho e abre o editor completo. */
  onReview: (patch: TablesUpdate<'brand_profiles'>) => void
}) {
  const [stage, setStage] = React.useState<Stage>('handle')
  const [handleInput, setHandleInput] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [source, setSource] = React.useState<Source | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [pendingHandle, setPendingHandle] = React.useState<string | null>(null)

  async function runDiscovery(handle: string) {
    setError(null)
    setStage('loading')
    try {
      const res = await startDiscovery(handle)
      if (res.status === 'failed') {
        if (res.error === 'not_configured' || res.error === 'ai_not_configured') {
          // Nunca mostrar infra ao usuário — degrada direto pro fallback.
          setStage('description')
          return
        }
        setError(DISCOVERY_ERROR_MESSAGES[res.error ?? ''] ?? res.message ?? 'Não conseguimos analisar esse perfil agora.')
        setStage('handle')
        return
      }
      if (!res.dna) {
        setStage('description')
        return
      }
      setSource({ kind: 'discovery', handle: res.handle, profile: res.profile, dna: res.dna })
      setStage('summary')
    } catch (err) {
      if (err instanceof DiscoveryNotConfiguredError) {
        setStage('description')
        return
      }
      setError(err instanceof Error ? err.message : 'Não conseguimos analisar esse perfil agora.')
      setStage('handle')
    }
  }

  // Um único uso: se a landing capturou o @ antes do cadastro, já dispara
  // o caminho automático existente (sem duplicar Discovery/UI extra).
  React.useEffect(() => {
    const pending = consumePendingInstagramHandle()
    if (!pending) return
    setPendingHandle(pending)
    setHandleInput(pending)
    void runDiscovery(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitHandle(e: React.FormEvent) {
    e.preventDefault()
    if (!handleInput.trim()) return
    await runDiscovery(handleInput)
  }

  async function submitDescription(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setError(null)
    setStage('loading')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brand-dna-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, businessDescription: description }),
      })
      const body = await res.json()
      if (!res.ok) {
        // brand-dna-assist já devolve mensagens amigáveis, sem termos de infra.
        setError(body.message || body.error || 'Não conseguimos gerar as sugestões agora.')
        setStage('description')
        return
      }
      setSource({ kind: 'description', suggestions: body.suggestions })
      setStage('summary')
    } catch {
      setError('Não conseguimos conectar agora. Tente novamente em instantes.')
      setStage('description')
    }
  }

  function buildPatch(): TablesUpdate<'brand_profiles'> {
    if (!source) return {}
    if (source.kind === 'discovery') {
      return mapDiscoveryDnaToBrandProfilePatch(source.handle, source.profile, source.dna)
    }
    return mapAiSuggestionsToBrandProfilePatch(companyNameFallback, source.suggestions)
  }

  function handleAccept() {
    setSaving(true)
    onAccept(buildPatch())
  }

  function handleReview() {
    setSaving(true)
    onReview(buildPatch())
  }

  if (stage === 'loading' || saving) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {saving ? 'Salvando...' : pendingHandle ? `Conhecendo a @${pendingHandle}...` : 'Conhecendo sua marca...'}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'handle') {
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
            {pendingHandle ? `Vamos conhecer a @${pendingHandle}` : 'Vamos conhecer sua marca'}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Qual é o Instagram da sua marca? A gente analisa sua presença pública e já monta uma primeira versão do
            seu DNA de marca.
          </p>
          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={submitHandle}>
            <Input
              placeholder="@minhamarca"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!handleInput.trim()}>
              Conhecer minha marca
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-danger-500">{error}</p>}
          <button
            type="button"
            className="mt-4 text-xs text-ink-400 hover:underline"
            onClick={() => setStage('description')}
          >
            Prefiro descrever minha marca em texto
          </button>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'description') {
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Conte um pouco sobre sua marca</h2>
          <p className="mt-1 text-sm text-ink-500">
            Em poucas frases: o que sua empresa faz, para quem ela vende e o que a torna especial. A IA usa isso
            para montar uma primeira versão do seu DNA de marca.
          </p>
          <form className="mt-5 flex flex-col gap-3" onSubmit={submitDescription}>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Somos uma clínica odontológica em São Paulo, atendemos famílias, focamos em atendimento humanizado e ortodontia."
              autoFocus
            />
            {error && <p className="text-sm text-danger-500">{error}</p>}
            <Button type="submit" disabled={!description.trim()} className="self-start">
              Conhecer minha marca
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  // stage === 'summary'
  if (source?.kind === 'discovery') {
    const { dna, profile } = source
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Conhecemos sua marca ✨</h2>
          <p className="mt-1 text-sm text-ink-500">
            Com base no que encontramos no seu Instagram, preparamos uma primeira versão do DNA da sua marca.
          </p>
          {profile?.name && (
            <p className="mt-4 text-sm font-medium text-ink-900 dark:text-ink-50">{profile.name}</p>
          )}
          {dna.identidade?.descricao?.value && (
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{dna.identidade.descricao.value}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {dna.identidade?.nicho?.value && <Badge variant="brand">{dna.identidade.nicho.value}</Badge>}
            {dna.voz?.tom?.value && <Badge>{dna.voz.tom.value}</Badge>}
            {dna.voz?.personalidade?.slice(0, 4).map((t) => (
              <Badge key={t} variant="neutral">{t}</Badge>
            ))}
          </div>
          {dna.publico?.publico_provavel?.value && (
            <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">
              <span className="font-medium text-ink-800 dark:text-ink-100">Público sugerido: </span>
              {dna.publico.publico_provavel.value}
            </p>
          )}
          {dna.estrategia?.temas_recorrentes?.length ? (
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              <span className="font-medium text-ink-800 dark:text-ink-100">Temas sugeridos: </span>
              {dna.estrategia.temas_recorrentes.join(', ')}
            </p>
          ) : null}
          <SummaryActions onAccept={handleAccept} onReview={handleReview} />
        </CardContent>
      </Card>
    )
  }

  if (source?.kind === 'description') {
    const s = source.suggestions
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Conhecemos sua marca ✨</h2>
          <p className="mt-1 text-sm text-ink-500">
            Com base no que você contou, preparamos uma primeira versão do DNA da sua marca.
          </p>
          {s.description && <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">{s.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {s.voice?.personality_traits?.slice(0, 4).map((t) => (
              <Badge key={t} variant="neutral">{t}</Badge>
            ))}
          </div>
          {s.audience?.pains?.length ? (
            <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">
              <span className="font-medium text-ink-800 dark:text-ink-100">Dores do público: </span>
              {s.audience.pains.join(', ')}
            </p>
          ) : null}
          {s.content_strategy?.priority_themes?.length ? (
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              <span className="font-medium text-ink-800 dark:text-ink-100">Temas sugeridos: </span>
              {s.content_strategy.priority_themes.join(', ')}
            </p>
          ) : null}
          <SummaryActions onAccept={handleAccept} onReview={handleReview} />
        </CardContent>
      </Card>
    )
  }

  return null
}

function SummaryActions({ onAccept, onReview }: { onAccept: () => void; onReview: () => void }) {
  return (
    <>
      <p className="mt-4 text-xs text-ink-400">
        Isso é uma sugestão da IA — você pode ajustar qualquer campo depois em "Revisar meu DNA".
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={onAccept}>
          Está certo, continuar
        </Button>
        <Button type="button" variant="outline" onClick={onReview}>
          Revisar meu DNA
        </Button>
      </div>
    </>
  )
}
