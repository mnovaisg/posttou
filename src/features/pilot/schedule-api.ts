import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type PilotScheduleSlotRow = Tables<'pilot_schedule_slots'>

export async function listPilotScheduleSlots(workspaceId: string): Promise<PilotScheduleSlotRow[]> {
  const { data, error } = await supabase
    .from('pilot_schedule_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('weekday', { ascending: true })
    .order('time_of_day', { ascending: true })
  if (error) throw error
  return data ?? []
}

export class PilotScheduleSlotConflictError extends Error {}

export async function upsertPilotScheduleSlot(
  workspaceId: string,
  input: { weekday: number; timeOfDay: string; directive: string | null; slotId?: string },
): Promise<PilotScheduleSlotRow> {
  // As colunas são nullable no banco (sem DEFAULT tipado pelo gerador),
  // mas o gerador de tipos do Supabase não infere isso — null é um valor
  // válido para a chamada real via PostgREST (mesmo padrão de api.ts).
  const { data, error } = await supabase.rpc('upsert_pilot_schedule_slot', {
    p_workspace_id: workspaceId,
    p_weekday: input.weekday,
    p_time_of_day: input.timeOfDay,
    p_directive: input.directive,
    p_slot_id: input.slotId ?? null,
  } as never)
  if (error) {
    if (error.message?.includes('Já existe um slot')) throw new PilotScheduleSlotConflictError('Já existe um slot nesse dia e horário.')
    throw error
  }
  return data
}

export async function deletePilotScheduleSlot(slotId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_pilot_schedule_slot', { p_slot_id: slotId })
  if (error) throw error
}
