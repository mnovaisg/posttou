import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function initials(name: string | null | undefined, email: string | undefined) {
  const base = name?.trim() || email || '?'
  return base
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, signOut } = useAuth()
  const { memberships, activeWorkspace, activeRole, setActiveWorkspaceId } = useWorkspace()
  const navigate = useNavigate()
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null

  async function handleSignOut() {
    await signOut()
    navigate('/entrar', { replace: true })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-ink-200 bg-white px-4 dark:border-ink-800 dark:bg-ink-900 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 md:hidden"
          aria-label="Abrir menu"
        >
          ☰
        </button>

        {memberships.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800">
              {activeWorkspace?.name ?? 'Workspace'}
              <span className="text-ink-400">▾</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Trocar workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {memberships.map((m) => (
                <DropdownMenuItem key={m.workspace.id} onSelect={() => setActiveWorkspaceId(m.workspace.id)}>
                  {m.workspace.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="px-2 text-sm font-medium text-ink-800 dark:text-ink-100">
            {activeWorkspace?.name ?? '—'}
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full">
          <Avatar>
            <AvatarFallback>{initials(fullName, user?.email)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium text-ink-900 dark:text-ink-50">{fullName ?? user?.email}</span>
              <span className="text-xs font-normal text-ink-400">{activeRole ?? ''}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/configuracoes')}>Configurações</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
