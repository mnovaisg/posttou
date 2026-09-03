import { supabase } from '@/lib/supabase/client'

export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  return data
}

export async function fetchMyMarketingConsent(): Promise<{ email: boolean | null; whatsapp: boolean | null }> {
  const { data, error } = await supabase.rpc('get_my_marketing_consent_system')
  if (error) throw error
  return data as unknown as { email: boolean | null; whatsapp: boolean | null }
}

export async function setMyMarketingConsent(channel: 'email' | 'whatsapp', optedIn: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_my_marketing_consent_system', { p_channel: channel, p_opted_in: optedIn })
  if (error) throw error
}
