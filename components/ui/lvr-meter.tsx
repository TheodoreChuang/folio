import * as React from 'react'
import { cn } from '@/lib/utils'

interface LvrMeterProps {
  /** LVR as a decimal, e.g. 0.65 for 65% */
  value: number
  className?: string
}

function LvrMeter({ value, className }: LvrMeterProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100

  return (
    <div className={cn('w-full h-1 bg-surface-sunken rounded-full relative', className)}>
      {/* Colour bands: green 0–60%, amber 60–80%, red 80–100% */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'linear-gradient(to right, hsl(152 38% 30% / 0.22) 0% 60%, hsl(34 70% 42% / 0.22) 60% 80%, hsl(14 58% 42% / 0.22) 80% 100%)',
        }}
      />
      {/* Pip */}
      <div
        className="absolute top-1/2 w-0.5 h-2.5 bg-ink rounded-sm -translate-y-1/2 -translate-x-1/2"
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}

export { LvrMeter }
export type { LvrMeterProps }
