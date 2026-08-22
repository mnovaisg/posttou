import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
      brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200',
      success: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}
