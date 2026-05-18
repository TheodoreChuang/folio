import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 h-[22px] px-[6px] rounded-full text-[11px] font-medium uppercase tracking-[0.06em] border whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        complete:   'bg-positive-soft text-positive border-positive/20',
        partial:    'bg-warning-soft text-warning border-warning/25',
        missing:    'bg-negative-soft text-negative border-negative/25',
        estimated:  'bg-accent-light text-accent border-accent/20',
      },
    },
    defaultVariants: { variant: 'complete' },
  }
)

function Badge({
  className,
  variant,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
      {props.children}
    </span>
  )
}

export { Badge, badgeVariants }
