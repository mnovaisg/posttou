import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/app/nav-items'
import { PosttouMark } from '@/components/brand/PosttouMark'

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      <NavLink
        to="/"
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
              : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
          )
        }
      >
        <span className="text-base">📋</span>
        Dashboard
      </NavLink>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
            )
          }
        >
          <span className="flex items-center gap-3">
            <span className="text-base">{item.icon}</span>
            {item.label}
          </span>
          {!item.implemented && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400">
              em breve
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-4 py-5">
      <PosttouMark size={32} />
      <span className="text-base font-semibold text-ink-900 dark:text-ink-50">POSTTOU</span>
    </div>
  )
}
