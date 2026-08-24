import { supabase } from '@/lib/supabase/client'

export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  return data
}
