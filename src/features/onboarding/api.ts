import { supabase } from '@/lib/supabase/client'

export interface OnboardingState {
  brand_dna_done: boolean
  visual_dna_done: boolean
  first_content_done: boolean
  instagram_connected_done: boolean
  first_publish_done: boolean
  pilot_active: boolean
  dismissed_steps: string[]
  onboarding_dismissed: boolean
}

export async function fetchOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const { data, error } = await supabase.rpc('get_onboarding_state', { p_workspace_id: workspaceId })
  if (error) throw error
  return data as unknown as OnboardingState
}

export async function dismissOnboardingStep(workspaceId: string, step: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_onboarding_step', { p_workspace_id: workspaceId, p_step: step })
  if (error) throw error
}

export async function dismissOnboarding(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_onboarding', { p_workspace_id: workspaceId })
  if (error) throw error
}
