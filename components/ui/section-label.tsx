import { cn } from '@/lib/utils'

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[0.6875rem] uppercase tracking-[0.12em] text-foreground-subtle font-medium mb-3', className)}>
      {children}
    </p>
  )
}
