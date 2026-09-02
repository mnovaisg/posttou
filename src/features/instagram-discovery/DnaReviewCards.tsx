import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/features/brand-dna/components/TagInput'
import { saveDiscoveryReview } from '@/features/instagram-discovery/api'
import type { DiscoveryDna, DiscoveryProfileSummary } from '@/features/instagram-discovery/types'

export interface DnaReviewState {
  name: string
  description: string
  segment: string
  audienceSummary: string
  audienceInterests: string[]
  audiencePains: string[]
  audienceDesires: string[]
  tone: string
  personality: string[]
  objectives: string[]
  themes: string[]
  colors: string[]
  imageStyle: string
  designStyle: string
  preferredWords: string[]
  forbiddenWords: string[]
}

/**
 * Converte o DNA preliminar da Discovery para o estado editável desta
 * tela — honesto por construção: cada campo só recebe valor quando a IA
 * realmente retornou algo (dna.identidade_visual nunca traz cores/estilo,
 * então esses campos sempre nascem vazios aqui, nunca inventados).
 */
export function buildDnaReviewState(dna: DiscoveryDna, profile?: DiscoveryProfileSummary): DnaReviewState {
  const themes = Array.from(
    new Set(
      [...(dna.estrategia?.pilares_conteudo?.map((p) => p.nome) ?? []), ...(dna.estrategia?.temas_recorrentes ?? [])].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  )
  const segment = [dna.identidade?.nicho?.value, dna.identidade?.subnicho?.value].filter(Boolean).join(' — ')

  return {
    name: profile?.name ?? '',
    description: dna.identidade?.descricao?.value ?? '',
    segment,
    audienceSummary: dna.publico?.publico_provavel?.value ?? '',
    audienceInterests: dna.publico?.interesses ?? [],
    audiencePains: dna.publico?.dores ?? [],
    audienceDesires: dna.publico?.desejos ?? [],
    tone: dna.voz?.tom?.value ?? '',
    personality: dna.voz?.personalidade ?? [],
    objectives: dna.estrategia?.objetivos_provaveis ?? [],
    themes,
    colors: [],
    imageStyle: '',
    designStyle: '',
    preferredWords: dna.voz?.vocabulario_recomendado ?? [],
    forbiddenWords: dna.voz?.palavras_evitar ?? [],
  }
}

function FieldCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{title}</h3>
        {children}
      </CardContent>
    </Card>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-400">{children}</p>
}

export function DnaReviewCards({
  dna,
  profile,
  token,
  initialState,
  onContinue,
}: {
  dna: DiscoveryDna
  profile?: DiscoveryProfileSummary
  /** Token opaco da sessão de Discovery — usado só para persistir a
   * revisão em pre_onboarding_sessions.dna_revisado, nunca exposto em URL. */
  token: string
  /** Revisão já salva de uma visita anterior (refresh) — quando presente,
   * o formulário parte dela em vez da sugestão original da IA. */
  initialState?: DnaReviewState | null
  onContinue: (state: DnaReviewState) => void
}) {
  const [state, setState] = React.useState<DnaReviewState>(() => initialState ?? buildDnaReviewState(dna, profile))

  function patch(next: Partial<DnaReviewState>) {
    setState((prev) => ({ ...prev, ...next }))
  }

  // Auto-save discreto: qualquer edição é persistida em
  // pre_onboarding_sessions.dna_revisado (nunca no dna_preliminar
  // original) depois de uma pequena pausa de digitação, pra um refresh
  // no meio da revisão nunca perder o que já foi editado. Best-effort —
  // falha aqui não deve interromper a experiência do visitante.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      saveDiscoveryReview(token, { dnaRevisado: state as unknown as Record<string, unknown> }).catch(() => {})
    }, 800)
    return () => window.clearTimeout(timer)
  }, [token, state])

  async function handleContinue() {
    await saveDiscoveryReview(token, { dnaRevisado: state as unknown as Record<string, unknown>, stage: 'previews' }).catch(() => {})
    onContinue(state)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-50">
          Olha o que entendemos sobre sua marca.
        </h2>
        <p className="mt-1 text-sm text-ink-500">Revise, ajuste o que quiser e siga em frente.</p>
      </div>

      <FieldCard title="Identidade">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-name">Nome</Label>
          <Input id="dna-name" value={state.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nome da sua marca" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-description">Descrição</Label>
          <Textarea
            id="dna-description"
            rows={3}
            value={state.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="O que sua marca faz, em poucas frases"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-segment">Segmento</Label>
          <Input
            id="dna-segment"
            value={state.segment}
            onChange={(e) => patch({ segment: e.target.value })}
            placeholder="Ex.: Moda — Streetwear"
          />
        </div>
      </FieldCard>

      <FieldCard title="Público">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-audience">Quem é seu público</Label>
          <Textarea
            id="dna-audience"
            rows={2}
            value={state.audienceSummary}
            onChange={(e) => patch({ audienceSummary: e.target.value })}
            placeholder="Descreva rapidamente quem acompanha sua marca"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Interesses</Label>
          <TagInput value={state.audienceInterests} onChange={(v) => patch({ audienceInterests: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Dores</Label>
          <TagInput value={state.audiencePains} onChange={(v) => patch({ audiencePains: v })} placeholder="Digite e pressione Enter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Desejos</Label>
          <TagInput value={state.audienceDesires} onChange={(v) => patch({ audienceDesires: v })} placeholder="Digite e pressione Enter" />
        </div>
      </FieldCard>

      <FieldCard title="Tom de voz">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-tone">Tom</Label>
          <Input id="dna-tone" value={state.tone} onChange={(e) => patch({ tone: e.target.value })} placeholder="Ex.: Direto e acolhedor" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Personalidade</Label>
          <TagInput value={state.personality} onChange={(v) => patch({ personality: v })} placeholder="Digite e pressione Enter" />
        </div>
      </FieldCard>

      <FieldCard title="Objetivos">
        <TagInput value={state.objectives} onChange={(v) => patch({ objectives: v })} placeholder="O que você quer alcançar com conteúdo" />
      </FieldCard>

      <FieldCard title="Pilares e temas">
        <TagInput value={state.themes} onChange={(v) => patch({ themes: v })} placeholder="Assuntos que sua marca deve cobrir" />
      </FieldCard>

      <FieldCard title="Identidade visual">
        <div className="flex flex-col gap-1.5">
          <Label>Cores</Label>
          {state.colors.length === 0 && (
            <EmptyHint>Ainda não conseguimos sugerir cores a partir do seu perfil — adicione as da sua marca.</EmptyHint>
          )}
          <TagInput value={state.colors} onChange={(v) => patch({ colors: v })} placeholder="Ex.: Roxo, Preto" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-image-style">Estilo de imagem</Label>
          {!state.imageStyle && <EmptyHint>Ainda não temos uma sugestão — descreva como suas artes devem parecer.</EmptyHint>}
          <Input
            id="dna-image-style"
            value={state.imageStyle}
            onChange={(e) => patch({ imageStyle: e.target.value })}
            placeholder="Ex.: Fotos reais, fundo claro"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dna-design-style">Estilo de design</Label>
          {!state.designStyle && <EmptyHint>Ainda não temos uma sugestão — descreva o estilo visual que combina com você.</EmptyHint>}
          <Input
            id="dna-design-style"
            value={state.designStyle}
            onChange={(e) => patch({ designStyle: e.target.value })}
            placeholder="Ex.: Minimalista, moderno"
          />
        </div>
      </FieldCard>

      <FieldCard title="Palavras e expressões">
        <TagInput value={state.preferredWords} onChange={(v) => patch({ preferredWords: v })} placeholder="Palavras que sua marca usa" />
      </FieldCard>

      <FieldCard title="O que evitar">
        <TagInput value={state.forbiddenWords} onChange={(v) => patch({ forbiddenWords: v })} placeholder="Palavras ou termos a evitar" />
      </FieldCard>

      <p className="text-center text-xs text-ink-400">
        Isso é uma sugestão da IA a partir de dados públicos — você pode ajustar tudo, agora ou depois.
      </p>

      <Button size="lg" className="w-full sm:w-auto sm:self-center" onClick={handleContinue}>
        Continuar
      </Button>
    </div>
  )
}
