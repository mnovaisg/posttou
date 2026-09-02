import * as React from 'react'
import { Link } from 'react-router-dom'
import { PosttouMark } from '@/components/brand/PosttouMark'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
]

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#topo" className="flex items-center gap-2">
          <PosttouMark size={28} />
          <span className="text-base font-semibold text-ink-900 dark:text-ink-50">POSTTOU</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/entrar"
            className="text-sm font-medium text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
            onClick={() => trackEvent('landing_cta_login_click')}
          >
            Entrar
          </Link>
          <Button
            asChild
            onClick={() => {
              trackEvent('signup_cta_clicked', { placement: 'header' })
              trackEvent('landing_cta_start_free_click', { placement: 'header' })
            }}
          >
            <Link to="/cadastro">Começar grátis</Link>
          </Button>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Abrir menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-100 bg-white px-4 py-4 dark:border-ink-800 dark:bg-ink-950 md:hidden">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-700 dark:text-ink-200"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
              <Link to="/entrar" className="text-sm font-medium text-ink-700 dark:text-ink-200">
                Entrar
              </Link>
              <Button
                asChild
                onClick={() => {
                  trackEvent('signup_cta_clicked', { placement: 'header_mobile' })
                  trackEvent('landing_cta_start_free_click', { placement: 'header_mobile' })
                }}
              >
                <Link to="/cadastro">Começar grátis</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
