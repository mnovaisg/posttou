import type { Tables } from '@/types/database'

export type InstagramAccountRow = Tables<'instagram_accounts'>

export const INSTAGRAM_ERROR_MESSAGES: Record<string, string> = {
  user_denied: 'Você cancelou a conexão com o Instagram.',
  access_denied: 'Você cancelou a conexão com o Instagram.',
  invalid_state: 'O link de conexão expirou ou já foi usado. Tente conectar de novo.',
  missing_params: 'A Meta não retornou os dados esperados. Tente conectar de novo.',
  already_connected_elsewhere: 'Essa conta do Instagram já está conectada em outro workspace do POSTTOU.',
  not_configured: 'A conexão com o Instagram ainda não está configurada neste ambiente.',
  storage_failed: 'Não foi possível salvar a conexão. Tente novamente.',
  provider_error: 'A Meta retornou um erro ao conectar sua conta. Tente novamente.',
}
