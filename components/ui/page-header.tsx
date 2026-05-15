import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  controls?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, controls, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-6 mb-8', className)}>
      <div>
        <h1 className="font-sans font-semibold text-[1.875rem] leading-none tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="font-serif font-light italic text-muted text-base mt-2 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {controls && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {controls}
        </div>
      )}
    </div>
  )
}
