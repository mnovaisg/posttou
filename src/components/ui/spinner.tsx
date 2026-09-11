import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  xs: { dot: 'h-1 w-1', gap: 'gap-0.5' },
  sm: { dot: 'h-1.5 w-1.5', gap: 'gap-1' },
  md: { dot: 'h-2 w-2', gap: 'gap-1.5' },
  lg: { dot: 'h-2.5 w-2.5', gap: 'gap-2' },
} as const

export type SpinnerSize = keyof typeof SIZE_CLASSES

/**
 * Indicador de carregamento com movimento sempre visível (3 pontos com
 * bounce escalonado) — nunca um anel estático/sutil demais pra perceber.
 * Usar em toda espera do sistema: botões de ação, diálogos de geração de
 * IA, telas cheias de "Carregando…".
 */
export function Spinner({ size = 'sm', className }: { size?: SpinnerSize; className?: string }) {
  const { dot, gap } = SIZE_CLASSES[size]
  return (
    <span className={cn('inline-flex items-center', gap, className)} role="status" aria-label="Carregando">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(dot, 'animate-bounce rounded-full bg-current')}
          style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.6s' }}
        />
      ))}
    </span>
  )
}
