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

/**
 * Controla se conteúdo criado no workspace precisa passar por
 * rascunho->em_revisao->aprovado antes de agendar/publicar, ou se pode ir
 * direto (owner/admin/editor). Só owner/admin pode mudar — validado de
 * novo no servidor, nunca confiado só no frontend.
 */
export async function updateWorkspaceApprovalSetting(workspaceId: string, requireApproval: boolean): Promise<void> {
  const { error } = await supabase.rpc('update_workspace_approval_setting', {
    p_workspace_id: workspaceId,
    p_require_approval: requireApproval,
  })
  if (error) throw error
}
