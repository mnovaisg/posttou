const STORAGE_KEY = 'posttou:pending-instagram-handle'

/**
 * Aceita "@usuario" ou "usuario", remove espaços e valida contra o
 * charset real de usernames do Instagram (letras, números, ponto,
 * underscore, 1-30 caracteres). Retorna null se obviamente inválido.
 */
export function normalizeInstagramHandle(raw: string): string | null {
  const cleaned = raw.trim().replace(/^@+/, '').replace(/\s+/g, '')
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleaned)) return null
  return cleaned
}

/** Transporte simples e temporário landing → cadastro → primeiro login. Não é uma segunda fonte de verdade: só guarda um @ público até o KnowYourBrandFlow consumir. */
export function setPendingInstagramHandle(handle: string) {
  window.localStorage.setItem(STORAGE_KEY, handle)
}

/** Leitura de uso único: consome e remove a chave. */
export function consumePendingInstagramHandle(): string | null {
  const value = window.localStorage.getItem(STORAGE_KEY)
  if (value) window.localStorage.removeItem(STORAGE_KEY)
  return value
}
