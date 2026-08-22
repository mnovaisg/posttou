import * as React from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarBrand, SidebarNav } from '@/app/Sidebar'
import { TopBar } from '@/app/TopBar'
import { cn } from '@/lib/utils'
import { useDiscoveryClaimOnLogin } from '@/features/instagram-discovery/useDiscoveryClaimOnLogin'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  useDiscoveryClaimOnLogin()

  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 md:flex">
        <SidebarBrand />
        <SidebarNav />
      </aside>

      {/* Sidebar mobile (drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside
            className={cn(
              'absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl dark:bg-ink-900',
            )}
          >
            <SidebarBrand />
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
