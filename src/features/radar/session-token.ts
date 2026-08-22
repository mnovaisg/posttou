// Mesmo princípio de src/features/instagram-discovery/session-token.ts:
// sessionStorage (nunca query string), consumido uma única vez por
// AiCreatePage.tsx para pré-preencher o formulário — nunca gera
// conteúdo automaticamente. Chave própria porque a origem (radar vs.
// discovery) precisa ser rastreável até contents.radar_opportunity_id.
export interface PendingRadarIdea {
  opportunityId: string
  titulo: string
  resumo: string
  formato: 'post' | 'carrossel' | 'reel'
  objetivo?: string
}

const PENDING_RADAR_IDEA_KEY = 'posttou:radar-pending-create-idea'

export function savePendingRadarIdea(idea: PendingRadarIdea): void {
  window.sessionStorage.setItem(PENDING_RADAR_IDEA_KEY, JSON.stringify(idea))
}

export function readPendingRadarIdea(): PendingRadarIdea | null {
  const raw = window.sessionStorage.getItem(PENDING_RADAR_IDEA_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingRadarIdea
  } catch {
    return null
  }
}

export function clearPendingRadarIdea(): void {
  window.sessionStorage.removeItem(PENDING_RADAR_IDEA_KEY)
}
