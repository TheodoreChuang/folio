import { cn } from '@/lib/utils'

interface CardShellProps {
  children: React.ReactNode
  className?: string
  pad?: boolean
}

export function CardShell({ children, className, pad }: CardShellProps) {
  return (
    <div className={cn(
      'bg-surface border border-border rounded-[7px]',
      pad && 'p-5',
      className,
    )}>
      {children}
    </div>
  )
}
