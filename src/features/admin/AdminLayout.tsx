import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/clientes', label: 'Clientes & Leads', end: false },
  { to: '/admin/cupons', label: 'Cupons', end: false },
]

// Área intencionalmente fora do AppLayout do cliente (sem sidebar de
// workspace, sem seletor de marca) — é uma superfície administrativa da
// plataforma, não uma tela do produto.
export function AdminLayout() {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <header className="border-b border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">POSTTOU · Admin</span>
            <nav className="flex gap-4">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `text-sm font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-200'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <NavLink to="/" className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">
            Voltar ao produto
          </NavLink>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
