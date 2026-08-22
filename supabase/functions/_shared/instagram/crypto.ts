// Criptografia dos tokens de acesso do Instagram antes de gravar em
// instagram_accounts.access_token_encrypted. AES-256-GCM com Web Crypto
// (nativo do runtime Deno das Edge Functions) — sem dependência externa,
// chave nunca sai do ambiente de secrets do Supabase.
//
// Formato armazenado: base64(iv de 12 bytes || ciphertext+tag do AES-GCM).

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function importKey(keyB64: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(keyB64)
  if (keyBytes.length !== 32) {
    throw new Error('INSTAGRAM_TOKEN_ENCRYPTION_KEY inválida: precisa ser 32 bytes (256 bits) em base64.')
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [usage])
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  const combined = new Uint8Array(iv.length + ciphertextBuf.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertextBuf), iv.length)
  return bytesToBase64(combined)
}

export async function decryptToken(encoded: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64, 'decrypt')
  const combined = base64ToBytes(encoded)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintextBuf)
}

/**
 * HMAC-SHA256(valor, secret) em hex — usado para pseudonimizar IP antes
 * de gravar (rate limit da Discovery pública). Nunca hash simples: o
 * espaço de IPv4 é pequeno demais para resistir a tabela pré-computada;
 * HMAC com secret só no servidor torna isso inviável na prática.
 */
export async function hmacSha256Hex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
