import * as React from 'react'
import { cn } from '@/lib/utils'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)
Select.displayName = 'Select'
