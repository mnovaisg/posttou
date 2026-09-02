import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type RadarTargetRow = Tables<'radar_targets'>
export type RadarTargetKind = 'termo' | 'hashtag' | 'concorrente'
export type RadarTargetSource = 'manual' | 'sugestao_dna'

/** Remove #/@ da frente, espaços das pontas, minúsculo — mesma normalização em todo lugar para nunca duplicar "musica" e "#musica". */
export function normalizeRadarTargetValue(raw: string): string {
  return raw.trim().replace(/^[#@]+/, '').trim().toLowerCase()
}

export async function listRadarTargets(workspaceId: string): Promise<RadarTargetRow[]> {
  const { data, error } = await supabase
    .from('radar_targets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export class RadarTargetLimitError extends Error {}
export class RadarTargetDuplicateError extends Error {}

export async function addRadarTarget(
  workspaceId: string,
  userId: string,
  kind: RadarTargetKind,
  rawValue: string,
  source: RadarTargetSource = 'manual',
): Promise<RadarTargetRow> {
  const value = normalizeRadarTargetValue(rawValue)
  if (!value) throw new Error('Valor vazio.')

  const { data, error } = await supabase
    .from('radar_targets')
    .insert({ workspace_id: workspaceId, kind, value, source, created_by: userId })
    .select('*')
    .single()

  if (error) {
    // Trigger de limite levanta exceção com essa mensagem exata (server-side, não contornável pelo client).
    if (error.message.includes('Limite de 5')) throw new RadarTargetLimitError('Limite de 5 itens atingido para este grupo.')
    // Unique constraint (workspace_id, kind, value) — duplicata normalizada.
    if (error.code === '23505') throw new RadarTargetDuplicateError('Esse item já está na sua lista.')
    throw error
  }
  return data
}

export async function removeRadarTarget(id: string): Promise<void> {
  const { error } = await supabase.from('radar_targets').delete().eq('id', id)
  if (error) throw error
}
