import { supabase } from '@/lib/supabase/client'
import { PUBLISH_ERROR_MESSAGES } from '@/features/instagram-publish/types'
import type { InstagramPublicationRow } from '@/features/instagram-publish/types'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return { Authorization: `Bearer ${token}` }
}

async function callSchedulePublication(body: Record<string, unknown>): Promise<{ success: true; [key: string]: unknown }> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch(`${FUNCTIONS_URL}/instagram-schedule-publication`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const responseBody = await res.json()
  if (!res.ok) {
    throw new Error(PUBLISH_ERROR_MESSAGES[responseBody.error as string] ?? responseBody.message ?? 'Não foi possível concluir a ação.')
  }
  return responseBody
}

export interface SchedulePublicationParams {
  contentId: string
  instagramAccountId: string
  contentVersionId: string
  renderedAssetPaths: string[]
  scheduledAt: string
}

export function schedulePublication(params: SchedulePublicationParams) {
  return callSchedulePublication({ action: 'schedule', ...params })
}

export function publishNow(params: Omit<SchedulePublicationParams, 'scheduledAt'>) {
  return callSchedulePublication({ action: 'publish_now', ...params })
}

export function cancelPublication(contentId: string) {
  return callSchedulePublication({ action: 'cancel', contentId })
}

export function reschedulePublication(contentId: string, scheduledAt: string) {
  return callSchedulePublication({ action: 'reschedule', contentId, scheduledAt })
}

export async function fetchActivePublication(contentId: string): Promise<InstagramPublicationRow | null> {
  const { data, error } = await supabase
    .from('instagram_publications')
    .select('*')
    .eq('content_id', contentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
