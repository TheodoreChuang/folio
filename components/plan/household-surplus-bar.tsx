import Link from 'next/link'
import { formatCents } from '@/lib/format'

type Props = {
  surplusCents: number | null
  consumedCents: number
  label: string
}

export function HouseholdSurplusBar({ surplusCents, consumedCents, label }: Props) {
  if (surplusCents === null) {
    return (
      <div className="mt-7 flex items-center gap-4 px-5 py-4 border border-dashed border-border-strong rounded bg-surface/50">
        <div className="w-7 h-7 flex-shrink-0 rounded-full bg-accent-soft text-accent grid place-items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 9h18M3 15h18M12 3v18" />
          </svg>
        </div>
        <p className="text-sm text-foreground-muted leading-snug">
          <strong className="font-semibold text-ink">Set up your Household</strong> to see how much of your monthly surplus this rate move would use.{' '}
          <Link href="/household" className="text-accent font-semibold">Go to Household →</Link>
        </p>
      </div>
    )
  }

  const pct = surplusCents > 0 ? Math.min(consumedCents / surplusCents, 1) : 1
  const isOver = consumedCents > surplusCents
  const remainingCents = surplusCents - consumedCents

  return (
    <div className="mt-7">
      <div className="flex justify-between items-baseline text-xs text-foreground-muted mb-3">
        <span>{label}</span>
        <span className="tabular-nums">
          <strong className="text-ink font-semibold">{formatCents(consumedCents)}</strong>
          {' '}of{' '}
          <strong className="text-ink font-semibold">{formatCents(surplusCents)}</strong>
          {' '}monthly surplus
        </span>
      </div>
      <div className="h-[9px] rounded-[5px] bg-surface-sunken border border-border overflow-hidden">
        <div
          className={`h-full rounded-[5px] transition-[width] duration-200 ${isOver ? 'bg-gradient-to-r from-warning to-negative' : 'bg-gradient-to-r from-positive to-warning'}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-foreground-muted leading-snug">
        {isOver ? (
          <>
            This move exceeds your surplus by{' '}
            <strong className="text-negative font-semibold tabular-nums">{formatCents(Math.abs(remainingCents))}</strong>
            {' '}per month.
          </>
        ) : (
          <>
            Leaves{' '}
            <strong className="text-ink font-semibold tabular-nums">{formatCents(remainingCents)}</strong>
            {' '}per month remaining.
          </>
        )}
      </p>
    </div>
  )
}
