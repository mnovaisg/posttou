import { supabase } from '@/lib/supabase/client'
import type { RadarOpportunityStatus, RadarOpportunityWithCluster } from '@/features/radar/types'

export async function fetchRadarOpportunities(workspaceId: string): Promise<RadarOpportunityWithCluster[]> {
  const { data, error } = await supabase
    .from('radar_opportunities')
    .select('*, radar_clusters(id, theme_summary, primary_topic, viral_score, viral_score_breakdown, signal_count, provider_diversity)')
    .eq('workspace_id', workspaceId)
    .in('status', ['new', 'saved'])
    .order('opportunity_score', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as RadarOpportunityWithCluster[]
}

export async function setRadarOpportunityStatus(
  opportunityId: string,
  status: Extract<RadarOpportunityStatus, 'saved' | 'dismissed' | 'new'>,
  dismissedReason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_radar_opportunity_status', {
    p_opportunity_id: opportunityId,
    p_status: status,
    p_dismissed_reason: dismissedReason,
  })
  if (error) throw error
}

export interface RadarRunSummary {
  started_at: string
  finished_at: string | null
  status: string
  signals_collected: number
  opportunities_created: number
  providers_failed: Record<string, string>
}

/** Só para a UI mostrar "atualizado há X" e um empty state honesto — nunca inventa tendência quando o run mais recente não trouxe nada. */
export async function fetchLatestRadarRun(): Promise<RadarRunSummary | null> {
  const { data, error } = await supabase
    .from('radar_runs')
    .select('started_at, finished_at, status, signals_collected, opportunities_created, providers_failed')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as RadarRunSummary | null
}
