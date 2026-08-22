import type { Enums, Tables } from '@/types/database'

export type InstagramPublicationRow = Tables<'instagram_publications'>
export type InstagramPublicationStatus = Enums<'instagram_publication_status'>

export const PUBLICATION_STATUS_LABEL: Record<InstagramPublicationStatus, string> = {
  pending: 'Na fila',
  processing: 'Processando',
  container_created: 'Preparando no Instagram',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
}

export const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  reauthorization_required: 'Sua conexão com o Instagram expirou. Reconecte para continuar publicando.',
  format_not_supported: 'Este formato ainda não é suportado (Reels depende de um pipeline de vídeo real, ainda pendente).',
  rate_limited: 'Limite de publicações do Instagram atingido. Vai tentar de novo automaticamente.',
  container_processing: 'Ainda processando no Instagram — vai continuar automaticamente.',
  container_error: 'O Instagram rejeitou a mídia enviada.',
  missing_rendered_asset: 'Nenhuma imagem renderizada foi encontrada para esta publicação.',
  content_not_found: 'O conteúdo associado não foi encontrado.',
  token_decrypt_failed: 'Falha interna ao acessar a conexão com o Instagram.',
  internal_error: 'Erro inesperado ao publicar.',
  invalid_state: 'Só é possível agendar/publicar conteúdo aprovado.',
  invalid_carousel_size: 'Carrossel precisa ter entre 2 e 10 imagens.',
  invalid_asset_count: 'Post único precisa de exatamente 1 imagem renderizada.',
  invalid_asset_path: 'Asset renderizado não pertence a este conteúdo.',
  invalid_version: 'Versão de conteúdo inválida.',
  invalid_account: 'Conta do Instagram inválida para este workspace.',
  already_active: 'Já existe uma publicação em andamento para este conteúdo.',
  already_processing: 'A publicação já está em processamento e não pode mais ser alterada.',
  forbidden: 'Só owner/admin pode publicar imediatamente.',
}
