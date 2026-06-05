import * as React from 'react'
import { cn } from '@/lib/utils'

interface MetricTileProps {
  label: string
  value: React.ReactNode
  valueClassName?: string
  foot?: React.ReactNode
  secondary?: boolean
  className?: string
}

function MetricTile({ label, value, valueClassName, foot, secondary, className }: MetricTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 min-h-[104px] rounded-[7px] border p-5',
        secondary
          ? 'bg-surface border-dashed border-border'
          : 'bg-surface border-border',
        className,
      )}
    >
      <div className="text-xs font-medium text-foreground-muted">{label}</div>
      <div
        className={cn(
          'font-semibold text-2xl tracking-[-0.01em] leading-none tabular-nums text-foreground',
          secondary && 'text-xl text-foreground-muted',
          valueClassName,
        )}
      >
        {value}
      </div>
      {foot && (
        <div className="flex items-center justify-between text-xs text-foreground-muted mt-auto">
          {foot}
        </div>
      )}
    </div>
  )
}

export { MetricTile }
export type { MetricTileProps }
