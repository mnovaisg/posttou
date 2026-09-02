import type { CouponDerivedStatus } from '@/features/admin/api'

export const STATUS_LABEL: Record<CouponDerivedStatus, string> = {
  active: 'Ativo',
  scheduled: 'Agendado',
  expired: 'Expirado',
  inactive: 'Inativo',
  limit_reached: 'Limite atingido',
}

export const STATUS_COLOR: Record<CouponDerivedStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  expired: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  inactive: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
  limit_reached: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}
