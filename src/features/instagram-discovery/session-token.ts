import type { DiscoveryIdea } from '@/features/instagram-discovery/types'

// O token opaco da Discovery pública nunca deve viajar em query
// string/URL de forma persistente (fica em histórico, logs, referrers).
// sessionStorage é o mecanismo temporário apropriado: some sozinho ao
// fechar a aba e nunca é enviado automaticamente em requisições — só é
// lido explicitamente para enviar à Edge Function autenticada de claim.
const TOKEN_KEY = 'posttou:discovery-token'
const SELECTED_IDEA_INDEX_KEY = 'posttou:discovery-selected-idea-index'
const PENDING_CREATE_IDEA_KEY = 'posttou:discovery-pending-create-idea'

export function saveDiscoveryToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token)
}

export function readDiscoveryToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY)
}

export function clearDiscoveryToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY)
}

/**
 * Índice da ideia escolhida antes do cadastro/login (mesmo princípio do
 * token: sessionStorage, nunca query string). Só faz sentido junto do
 * token da mesma sessão — o índice é resolvido contra o array real de
 * ideias retornado pelo claim, não confiado do lado do cliente.
 */
export function saveSelectedIdeaIndex(index: number): void {
  window.sessionStorage.setItem(SELECTED_IDEA_INDEX_KEY, String(index))
}

export function readSelectedIdeaIndex(): number | null {
  const raw = window.sessionStorage.getItem(SELECTED_IDEA_INDEX_KEY)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function clearSelectedIdeaIndex(): void {
  window.sessionStorage.removeItem(SELECTED_IDEA_INDEX_KEY)
}

/**
 * Ideia concreta (já resolvida a partir do array retornado pelo claim)
 * a ser pré-carregada em /criar assim que o usuário concluir a
 * revisão/aprovação do DNA. Também sessionStorage — dado de conteúdo
 * comum, não sensível, mas sobrevive só à aba/sessão atual.
 */
export function savePendingCreateIdea(idea: DiscoveryIdea): void {
  window.sessionStorage.setItem(PENDING_CREATE_IDEA_KEY, JSON.stringify(idea))
}

export function readPendingCreateIdea(): DiscoveryIdea | null {
  const raw = window.sessionStorage.getItem(PENDING_CREATE_IDEA_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DiscoveryIdea
  } catch {
    return null
  }
}

export function clearPendingCreateIdea(): void {
  window.sessionStorage.removeItem(PENDING_CREATE_IDEA_KEY)
}
