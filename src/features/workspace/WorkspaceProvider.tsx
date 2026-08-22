import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Enums, Tables } from '@/types/database'

const ACTIVE_WORKSPACE_KEY = 'posttou:active-workspace'

export interface WorkspaceMembership {
  workspace: Tables<'workspaces'>
  role: Enums<'workspace_role'>
}

interface WorkspaceContextValue {
  memberships: WorkspaceMembership[]
  activeWorkspace: Tables<'workspaces'> | null
  activeRole: Enums<'workspace_role'> | null
  isLoading: boolean
  error: string | null
  setActiveWorkspaceId: (id: string) => void
  hasRole: (roles: Enums<'workspace_role'>[]) => boolean
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState<string | null>(
    () => window.localStorage.getItem(ACTIVE_WORKSPACE_KEY),
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['workspace-memberships', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<WorkspaceMembership[]> => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role, workspace:workspaces(*)')
        .order('created_at', { ascending: true })

      if (error) throw error

      return (data ?? [])
        .filter((row) => row.workspace)
        .map((row) => ({ workspace: row.workspace as Tables<'workspaces'>, role: row.role }))
    },
  })

  const memberships = data ?? []

  React.useEffect(() => {
    if (memberships.length === 0) return
    const stillValid = memberships.some((m) => m.workspace.id === activeWorkspaceId)
    if (!stillValid) {
      const first = memberships[0].workspace.id
      setActiveWorkspaceIdState(first)
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships.map((m) => m.workspace.id).join(',')])

  const setActiveWorkspaceId = React.useCallback(
    (id: string) => {
      setActiveWorkspaceIdState(id)
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'workspace-memberships' })
    },
    [queryClient],
  )

  const active = memberships.find((m) => m.workspace.id === activeWorkspaceId) ?? memberships[0] ?? null

  const hasRole = React.useCallback(
    (roles: Enums<'workspace_role'>[]) => (active ? roles.includes(active.role) : false),
    [active],
  )

  const value: WorkspaceContextValue = {
    memberships,
    activeWorkspace: active?.workspace ?? null,
    activeRole: active?.role ?? null,
    isLoading,
    error: error ? 'Não foi possível carregar seus workspaces.' : null,
    setActiveWorkspaceId,
    hasRole,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>')
  return ctx
}
