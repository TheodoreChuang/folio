'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/lib/format'
import { BackToScenarios } from '@/components/plan/back-to-scenarios'
import { HouseholdSurplusBar } from '@/components/plan/household-surplus-bar'
import { computeRateSensitivity } from '@/lib/aggregate/plan/calculators/rate-sensitivity'
import type { PlanContext } from '@/lib/aggregate/plan/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'loaded'; context: PlanContext }
  | { status: 'error' }

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN = -3
const MAX = 3
const STEP = 0.25
const TICKS = [-3, -2, -1, 0, 1, 2, 3]

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctToPos(value: number): number {
  return ((value - MIN) / (MAX - MIN)) * 100
}

function formatDelta(cents: number, sign = true): string {
  const prefix = sign ? (cents > 0 ? '+' : cents < 0 ? '−' : '') : ''
  return prefix + formatCents(Math.abs(cents))
}

function formatRate(rate: number): string {
  return rate.toFixed(2) + '%'
}

// ── Slider ────────────────────────────────────────────────────────────────────

function RateSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const posFromEvent = useCallback((clientX: number): number => {
    const rail = railRef.current
    if (!rail) return MIN
    const rect = rail.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * (MAX - MIN) + MIN
    const snapped = Math.round(raw / STEP) * STEP
    return Math.max(MIN, Math.min(MAX, parseFloat(snapped.toFixed(2))))
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    onChange(posFromEvent(e.clientX))
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      onChange(posFromEvent(e.clientX))
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onChange, posFromEvent])

  const thumbPos = pctToPos(value)
  const isUp = value > 0
  const isDown = value < 0
  const isToday = value === 0

  // Fill from center (50%) to thumb
  const fillLeft = isDown ? `${thumbPos}%` : '50%'
  const fillWidth = `${Math.abs(thumbPos - 50)}%`

  const tagClass = isToday
    ? 'bg-ink text-white'
    : isUp
    ? 'bg-negative text-white'
    : 'bg-positive text-white'

  const tagLabel = isToday ? 'Today' : `${isUp ? '+' : ''}${value.toFixed(2)}%`

  return (
    <div className="relative pt-9 px-0.5">
      {/* Thumb value tag */}
      <div
        className="absolute bottom-[calc(100%-34px)] pointer-events-none"
        style={{ left: `${thumbPos}%`, transform: 'translateX(-50%)' }}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold tabular-nums whitespace-nowrap relative ${tagClass}`}>
          {tagLabel}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: 'inherit' }}
          />
        </span>
      </div>

      {/* Track hit area */}
      <div
        className="relative h-[30px] flex items-center cursor-pointer touch-none"
        ref={railRef}
        onMouseDown={handleMouseDown}
      >
        {/* Rail */}
        <div className="relative w-full h-1.5 rounded-full bg-surface-sunken border border-border overflow-hidden">
          {/* Center marker */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-border-strong z-10" />
          {/* Fill */}
          {value !== 0 && (
            <div
              className={`absolute top-0 bottom-0 ${isUp ? 'bg-negative/55' : 'bg-positive/55'}`}
              style={{ left: fillLeft, width: fillWidth }}
            />
          )}
        </div>
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-surface border-[1.5px] border-ink shadow-sm cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent/25"
          style={{ left: `${thumbPos}%`, transform: 'translate(-50%, -50%)' }}
          role="slider"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={value}
          aria-label="Rate change"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault()
              onChange(Math.min(MAX, parseFloat((value + STEP).toFixed(2))))
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault()
              onChange(Math.max(MIN, parseFloat((value - STEP).toFixed(2))))
            }
          }}
        />
      </div>

      {/* Tick marks */}
      <div className="relative h-[38px] mt-3">
        {TICKS.map(tick => {
          const isActive = value === tick
          const tickUp = tick > 0
          const tickDown = tick < 0
          const tickToday = tick === 0

          let dotColor = 'bg-border-strong'
          let labelColor = 'text-foreground-subtle'
          let fontWeight = 'font-normal'

          if (tickUp) { dotColor = 'bg-negative/50'; labelColor = 'text-negative/70' }
          if (tickDown) { dotColor = 'bg-positive/50'; labelColor = 'text-positive/75' }
          if (tickToday) { dotColor = 'bg-foreground-muted'; labelColor = 'text-foreground-muted font-semibold' }
          if (isActive) {
            fontWeight = 'font-semibold'
            if (tickUp) { dotColor = 'bg-negative'; labelColor = 'text-negative' }
            if (tickDown) { dotColor = 'bg-positive'; labelColor = 'text-positive' }
            if (tickToday) { dotColor = 'bg-ink'; labelColor = 'text-ink' }
          }

          return (
            <button
              key={tick}
              type="button"
              onClick={() => onChange(tick)}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-[5px] px-0.5 pt-1 bg-transparent border-0 cursor-pointer"
              style={{ left: `${pctToPos(tick)}%` }}
            >
              <span className={`w-[5px] h-[5px] rounded-full ${dotColor} ${isActive ? 'scale-[1.3]' : ''} transition-all duration-100`} />
              <span className={`text-[10px] tabular-nums whitespace-nowrap ${labelColor} ${fontWeight} transition-colors duration-100`}>
                {tick === 0 ? 'Today' : `${tick > 0 ? '+' : ''}${tick}%`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RateSensitivityPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  const [delta, setDelta] = useState(0)

  useEffect(() => {
    fetch('/api/plan/context')
      .then(res => {
        if (res.status === 401) { router.push('/login'); return null }
        return res.json()
      })
      .then(body => {
        if (!body) return
        if (body.context) {
          setPageState({ status: 'loaded', context: body.context })
        } else {
          setPageState({ status: 'error' })
        }
      })
      .catch(() => setPageState({ status: 'error' }))
  }, [router])

  if (pageState.status === 'loading') {
    return (
      <div>
        <BackToScenarios />
        <div className="flex items-center justify-center py-24 text-sm text-muted">Loading…</div>
      </div>
    )
  }

  if (pageState.status === 'error') {
    return (
      <div>
        <BackToScenarios />
        <p className="text-sm text-muted py-8">Failed to load. Refresh to try again.</p>
      </div>
    )
  }

  const { context } = pageState
  const result = computeRateSensitivity(context.loans, delta, context.portfolioBaseline, context.householdSurplusMonthlyCents)

  const isUp = delta > 0
  const isDown = delta < 0

  const cashflowChangeLabel = result.portfolioCashflowTodayCents !== null && result.portfolioCashflowAtDeltaCents !== null
    ? result.portfolioCashflowAtDeltaCents - result.portfolioCashflowTodayCents
    : null

  return (
    <div className="max-w-[920px]">
      <BackToScenarios />

      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Rate sensitivity</h1>
        <p className="text-sm text-muted mt-0.5">
          Stress every variable loan against a rate rise or fall, and see where the cashflow lands.
        </p>
      </div>

      {/* Control */}
      <div className="border border-border rounded-xl bg-surface-raised px-6 pt-5 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-2">
          Rate move
        </p>
        <RateSlider value={delta} onChange={setDelta} />
      </div>

      {/* Outputs */}
      <div className="mt-6 flex flex-col gap-6">

        {/* Headline */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-2">
            Total repayment change
          </p>
          <div className="flex items-baseline gap-3">
            <span className={`font-display text-3xl tracking-tight ${delta === 0 ? 'text-ink' : isUp ? 'text-negative' : 'text-positive'}`}>
              {delta === 0 ? 'No change' : formatDelta(result.totalChangeCents)}
            </span>
            {delta !== 0 && (
              <span className={`text-sm font-semibold px-3 py-0.5 rounded-full ${isUp ? 'text-negative bg-negative/10' : 'text-positive bg-positive/10'}`}>
                {isUp ? 'per month more' : 'per month less'}
              </span>
            )}
          </div>
          {result.portfolioCashflowAtDeltaCents !== null && (
            <p className="mt-1 text-sm text-foreground-muted leading-snug max-w-[60ch]">
              Portfolio cashflow would be{' '}
              <strong className={`font-semibold tabular-nums ${result.portfolioCashflowAtDeltaCents >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatCents(result.portfolioCashflowAtDeltaCents)}
              </strong>
              {' '}per month
              {cashflowChangeLabel !== null && delta !== 0 && (
                <>
                  {' '}({cashflowChangeLabel > 0 ? '+' : cashflowChangeLabel < 0 ? '−' : ''}
                  <span className="tabular-nums">{formatCents(Math.abs(cashflowChangeLabel))}</span> vs today)
                </>
              )}
              .
            </p>
          )}
        </div>

        {/* Per-loan table */}
        {result.perLoan.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-2">
              Per-loan impact
            </p>
            <div className="border border-border rounded bg-surface-raised overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[minmax(0,1.5fr)_96px_116px_92px] gap-3 px-5 py-3 bg-surface-sunken/50 text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle">
                <div>Loan</div>
                <div className="text-right">Balance</div>
                <div className="text-right">
                  {delta === 0 ? 'Repayment' : `At ${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`}
                </div>
                <div className="text-right">Change</div>
              </div>

              {/* Loan rows */}
              {result.perLoan.map(row => {
                const isRowUp = row.changeCents > 0
                const isRowDown = row.changeCents < 0
                return (
                  <div
                    key={row.loanId}
                    className="grid grid-cols-[minmax(0,1.5fr)_96px_116px_92px] gap-3 px-5 py-4 border-t border-rule text-sm"
                  >
                    <div>
                      <span className="block font-semibold text-ink">{row.nickname ?? row.lender}</span>
                      <span className="block mt-0.5 text-[10px] text-foreground-muted tabular-nums">
                        {row.nickname ? row.lender + ' · ' : ''}{formatRate(row.baseRate)}
                        {delta !== 0 && ` → ${formatRate(row.newRate)}`}
                      </span>
                    </div>
                    <div className="text-right tabular-nums text-ink self-center text-sm">
                      {formatCents(row.balanceCents)}
                    </div>
                    <div className="text-right self-center">
                      <span className="block tabular-nums text-ink">{formatCents(row.deltaRepaymentCents)}</span>
                      {delta !== 0 && (
                        <span className="block mt-0.5 text-[10px] text-foreground-subtle tabular-nums">
                          was {formatCents(row.todayRepaymentCents)}
                        </span>
                      )}
                    </div>
                    <div className={`text-right tabular-nums font-semibold self-center ${isRowUp ? 'text-negative' : isRowDown ? 'text-positive' : 'text-foreground-faint'}`}>
                      {row.changeCents === 0 ? '—' : formatDelta(row.changeCents)}
                    </div>
                  </div>
                )
              })}

              {/* Total row */}
              <div className="grid grid-cols-[minmax(0,1.5fr)_96px_116px_92px] gap-3 px-5 py-4 border-t border-border bg-surface-sunken/60 text-sm">
                <div className="font-semibold text-ink">Total</div>
                <div />
                <div className="text-right tabular-nums font-semibold text-ink self-center">
                  {formatCents(result.totalDeltaRepaymentsCents)}
                </div>
                <div className={`text-right tabular-nums font-bold self-center ${isUp ? 'text-negative' : isDown ? 'text-positive' : 'text-foreground-faint'}`}>
                  {result.totalChangeCents === 0 ? '—' : formatDelta(result.totalChangeCents)}
                </div>
              </div>
            </div>

            {/* Excluded footnote */}
            {result.excludedCount > 0 && (
              <p className="mt-2 text-xs text-foreground-muted">
                {result.excludedCount} loan{result.excludedCount !== 1 ? 's' : ''} excluded — no rate or balance recorded.
              </p>
            )}
          </div>
        )}

        {/* No variable loans */}
        {result.perLoan.length === 0 && context.loans.length > 0 && (
          <p className="text-sm text-muted py-4">
            No variable loans with a recorded rate and balance. Add rate and balance data to your loans to model a rate move.
          </p>
        )}

        {/* Household surplus bar */}
        <HouseholdSurplusBar
          surplusCents={result.householdSurplusMonthlyCents}
          consumedCents={Math.max(0, result.totalChangeCents)}
          label="Rate move would consume"
        />
      </div>
    </div>
  )
}
