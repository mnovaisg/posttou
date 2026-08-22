import markUrl from '@/assets/brand/posttou-mark-192.png'
import { cn } from '@/lib/utils'

/** Ícone oficial da marca (o "P" com balão de chat). Uso em sidebar, telas
 * de autenticação e qualquer outro lugar que hoje usa o badge "P". */
export function PosttouMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src={markUrl}
      alt="POSTTOU"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    />
  )
}
