import { Link } from 'react-router-dom'
import { PosttouMark } from '@/components/brand/PosttouMark'
import { getSupportEmail } from '@/lib/support'

export function LandingFooter() {
  const supportEmail = getSupportEmail()

  return (
    <footer className="border-t border-ink-100 py-10 dark:border-ink-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <PosttouMark size={24} />
          <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">POSTTOU</span>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-ink-500 sm:flex sm:gap-10">
          <a href="#recursos" className="hover:text-ink-900 dark:hover:text-ink-100">
            Produto
          </a>
          <a href="#planos" className="hover:text-ink-900 dark:hover:text-ink-100">
            Planos
          </a>
          <Link to="/termos-de-uso" className="hover:text-ink-900 dark:hover:text-ink-100">
            Termos de Uso
          </Link>
          <Link to="/politica-de-privacidade" className="hover:text-ink-900 dark:hover:text-ink-100">
            Política de Privacidade
          </Link>
          {supportEmail && (
            <a href={`mailto:${supportEmail}`} className="hover:text-ink-900 dark:hover:text-ink-100">
              Suporte
            </a>
          )}
          <Link to="/entrar" className="hover:text-ink-900 dark:hover:text-ink-100">
            Entrar
          </Link>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-ink-400 sm:px-6">
        © {new Date().getFullYear()} POSTTOU. Todos os direitos reservados.
      </p>
    </footer>
  )
}
