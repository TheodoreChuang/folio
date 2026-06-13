'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/lib/format'
import { BackToScenarios } from '@/components/plan/back-to-scenarios'
import { HouseholdSurplusBar } from '@/components/plan/household-surplus-bar'
import { computeIoRollover, DEFAULT_DISCOUNT } from '@/lib/aggregate/plan/calculators/io-rollover'
import type { PlanContext } from '@/lib/aggregate/plan/context'
import type { IoRolloverRow, IoRolloverResult } from '@/lib/aggregate/plan/calculators/io-rollover'

// ── Types ─────────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'loaded'; context: PlanContext }
  | { status: 'error' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(date: Date): string {
  return MONTHS[date.getMonth()] + ' ' + date.getFullYear()
}

function dayLabel(date: Date): string {
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear()
}

function fmtMoney(cents: number): string {
  const neg = cents < -0.5
  const abs = Math.round(Math.abs(cents))
  if (abs >= 100_000_000) return `${neg ? '−' : ''}$${(abs / 100_000_000).toFixed(1)}m`
  if (abs >= 100_000) return `${neg ? '−' : ''}$${Math.round(abs / 100_000)}k`
  return `${neg ? '−' : ''}$${Math.round(abs / 100).toLocaleString('en-AU')}`
}

function fmtSigned(cents: number): string {
  const v = Math.round(cents)
  if (v === 0) return '$0'
  const abs = Math.abs(v)
  return (v > 0 ? '+' : '−') + '$' + Math.round(abs / 100).toLocaleString('en-AU')
}

function fmtRate(r: number): string {
  return r.toFixed(2) + '%'
}

function fmtK(cents: number): string {
  return '$' + Math.round(Math.abs(cents) / 100_000) + 'k'
}

// ── Timeline ──────────────────────────────────────────────────────────────────

const MS_YEAR = 365.25 * 24 * 3600 * 1000

function Timeline({ rows }: { rows: IoRolloverRow[] }) {
  const today = new Date()
  const axisStart = new Date(today.getFullYear(), 0, 1)
  const lastEnd = rows.length > 0
    ? parseLocalDate(rows[rows.length - 1].ioEndDate)
    : addMonths(today, 12)
  const axisEnd = addMonths(lastEnd, 12)
  const span = axisEnd.getTime() - axisStart.getTime() || 1

  function fracOf(date: Date): number {
    return Math.max(0, Math.min(1, (date.getTime() - axisStart.getTime()) / span))
  }

  const spanYears = span / MS_YEAR
  const stepYrs = spanYears > 7 ? 2 : 1
  const ticks: number[] = []
  for (let y = axisStart.getFullYear(); y <= axisEnd.getFullYear(); y += stepYrs) {
    ticks.push(y)
  }

  const dense = rows.length > 4
  const todayFrac = fracOf(today)

  return (
    <div className="relative px-8 pb-7 pt-2">
      {/* Axis line */}
      <div className="relative h-0.5 bg-border my-14">
        {/* Today marker */}
        <div
          className="absolute top-[-10px] bottom-[-10px] w-px bg-foreground-subtle"
          style={{ left: `${todayFrac * 100}%` }}
        >
          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-foreground-muted font-medium">
            Today · {monthLabel(today)}
          </span>
        </div>

        {/* Year ticks */}
        {ticks.map(year => {
          const frac = fracOf(new Date(year, 0, 1))
          return (
            <div
              key={year}
              className="absolute top-[-4px] w-px h-2.5 bg-foreground-subtle/60"
              style={{ left: `${frac * 100}%` }}
            >
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-[10px] text-foreground-subtle whitespace-nowrap tabular-nums">
                {year}
              </span>
            </div>
          )
        })}

        {/* Event pins */}
        {rows.map((row, i) => {
          const frac = fracOf(parseLocalDate(row.ioEndDate))
          const isAlt = i % 2 !== 0
          return (
            <div
              key={row.loanId}
              className="absolute"
              style={{ left: `${frac * 100}%` }}
            >
              {/* Pin dot */}
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-negative border-2 border-surface shadow-sm" />
              {/* Label — alternating heights */}
              <div
                className={`absolute -translate-x-1/2 text-center ${isAlt ? 'bottom-full mb-7' : 'top-full mt-7'}`}
              >
                {!dense && (
                  <div className="text-[10px] font-medium text-foreground whitespace-nowrap">
                    {row.nickname ?? `${row.lender}`}
                  </div>
                )}
                <div className="text-[10px] text-foreground-muted whitespace-nowrap">
                  {dense ? monthLabel(parseLocalDate(row.ioEndDate)) : dayLabel(parseLocalDate(row.ioEndDate))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cashflow chart (custom SVG — scales to any number of rollovers) ───────────

function CashflowChart({
  rows,
  result,
  baseline,
  surplusCents,
}: {
  rows: IoRolloverRow[]
  result: IoRolloverResult
  baseline: PlanContext['portfolioBaseline']
  surplusCents: number | null
}) {
  if (!baseline) return null

  const today = new Date()
  const axisStart = new Date(today.getFullYear(), 0, 1)
  const lastEnd = rows.length > 0
    ? parseLocalDate(rows[rows.length - 1].ioEndDate)
    : addMonths(today, 12)
  const axisEnd = addMonths(lastEnd, 12)
  const span = axisEnd.getTime() - axisStart.getTime() || 1

  function fracOf(date: Date): number {
    return Math.max(0, Math.min(1, (date.getTime() - axisStart.getTime()) / span))
  }

  const spanYears = span / MS_YEAR
  const stepYrs = spanYears > 7 ? 2 : 1
  const yearTicks: number[] = []
  for (let y = axisStart.getFullYear(); y <= axisEnd.getFullYear(); y += stepYrs) {
    yearTicks.push(y)
  }

  const W = 900, H = 248
  const padL = 16, padR = 16, padT = 26, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const todayCashflow = baseline.rentMonthlyCents - baseline.expensesMonthlyCents - baseline.loanRepaymentsMonthlyCents
  const finalCashflow = todayCashflow - result.totalAdditionalMonthlyCents

  const surplusFloor = surplusCents !== null ? -surplusCents : 0
  const worst = Math.min(finalCashflow, surplusFloor)
  const floor = worst < 0 ? worst * 1.18 : -Math.abs(todayCashflow) * 0.2 || -1000
  const chartMax = Math.max(0, todayCashflow) * 1.1 || 1000

  function x(frac: number): number { return padL + frac * plotW }
  function y(v: number): number {
    // Map value to SVG y: chartMax at top (padT), floor at bottom (H - padB)
    const range = chartMax - floor
    return padT + (1 - (v - floor) / range) * plotH
  }

  // Staircase points
  const todayFrac = fracOf(today)
  const pts: [number, number][] = [[todayFrac, todayCashflow]]
  let running = todayCashflow
  for (const row of rows) {
    const frac = fracOf(parseLocalDate(row.ioEndDate))
    pts.push([frac, running])            // flat travel to rollover
    running -= row.deltaCents ?? 0
    pts.push([frac, running])            // step down
  }
  pts.push([1, running])                 // extend to right edge

  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ')
  const areaPath = `M${x(todayFrac).toFixed(1)} ${y(0).toFixed(1)} ` +
    pts.map(p => `L${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ') +
    ` L${x(1).toFixed(1)} ${y(0).toFixed(1)} Z`

  const rolls = rows.filter(r => r.deltaCents !== null)
  const showDotLabels = rolls.length <= 4
  // Only show surplus limit when surplus is positive — a zero or negative surplus has no meaningful limit line
  const surplusY = surplusCents !== null && surplusCents > 0 ? y(-surplusCents) : null
  const zeroY = y(0)

  return (
    <section className="border border-border rounded-xl bg-surface-raised overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-0.5">
            Net cashflow as each loan rolls
          </p>
          <p className="text-xs text-foreground-muted">
            The same timeline, read as your whole-portfolio monthly position.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-foreground-subtle shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 bg-negative/70 rounded" />
            Net / mo
          </span>
          {surplusCents !== null && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-px border-t border-dashed border-foreground-subtle" />
              Surplus limit
            </span>
          )}
        </div>
      </div>

      <div className="px-2">
        <svg
          className="w-full"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Net monthly cashflow stepping down as each interest-only loan rolls to principal and interest"
        >
          {/* Year gridlines */}
          {yearTicks.map(year => {
            const frac = fracOf(new Date(year, 0, 1))
            return (
              <g key={year}>
                <line className="stroke-border" x1={x(frac)} x2={x(frac)} y1={padT - 6} y2={H - padB} strokeWidth={1} />
                <text x={x(frac)} y={H - padB + 15} textAnchor="middle" fontSize={10} fill="hsl(34 5% 56%)">{year}</text>
              </g>
            )
          })}

          {/* Zero line */}
          <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="hsl(36 12% 86%)" strokeWidth={1} />

          {/* Today marker */}
          <line x1={x(todayFrac)} x2={x(todayFrac)} y1={padT - 6} y2={H - padB} stroke="hsl(34 5% 56%)" strokeWidth={1} strokeDasharray="3 3" />

          {/* Surplus limit */}
          {surplusY !== null && surplusCents !== null && (
            <>
              <line x1={padL} x2={W - padR} y1={surplusY} y2={surplusY} stroke="hsl(34 5% 56%)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={padL + 2} y={surplusY - 6} textAnchor="start" fontSize={10} fill="hsl(34 5% 56%)">
                Surplus limit · {fmtMoney(-surplusCents)} /mo
              </text>
            </>
          )}

          {/* Shaded cost band */}
          <path d={areaPath} fill="hsl(14 58% 42% / 0.12)" />
          <path d={linePath} fill="none" stroke="hsl(14 58% 42% / 0.8)" strokeWidth={2} />

          {/* Rollover dots — cashflow after each loan rolls */}
          {rows.map((row, i) => {
            const runningCashflow = todayCashflow - rows.slice(0, i + 1).reduce((s, r) => s + (r.deltaCents ?? 0), 0)
            const frac = fracOf(parseLocalDate(row.ioEndDate))
            const cy = y(runningCashflow)
            return (
              <g key={row.loanId}>
                <circle cx={x(frac)} cy={cy} r={4} fill="hsl(14 58% 42%)" />
                {showDotLabels && (
                  <text x={x(frac)} y={cy + 18} textAnchor="middle" fontSize={10} fill="hsl(34 5% 56%)">
                    {fmtMoney(runningCashflow)}
                  </text>
                )}
              </g>
            )
          })}

          {/* Endpoint labels */}
          <text x={x(todayFrac) + 4} y={y(todayCashflow) - 9} fontSize={10} fill="hsl(34 5% 56%)">
            Today · {fmtMoney(todayCashflow)}
          </text>
          <text x={x(1) - 2} y={y(finalCashflow) - 9} textAnchor="end" fontSize={10} fill="hsl(34 5% 56%)">
            Fully rolled · {fmtMoney(finalCashflow)}
          </text>
        </svg>
      </div>

      {/* Stats footer */}
      <div className="px-5 pb-5 pt-2 border-t border-rule flex items-start gap-8 flex-wrap">
        <div>
          <div className="text-[10px] text-foreground-subtle uppercase tracking-[0.07em] mb-0.5">Today</div>
          <div className={`text-lg font-display tabular-nums ${todayCashflow >= 0 ? 'text-positive' : 'text-negative'}`}>
            {fmtMoney(todayCashflow)}<span className="text-xs font-sans font-normal text-foreground-muted ml-0.5">/mo</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-foreground-subtle uppercase tracking-[0.07em] mb-0.5">Fully rolled</div>
          <div className={`text-lg font-display tabular-nums ${finalCashflow >= 0 ? 'text-positive' : 'text-negative'}`}>
            {fmtMoney(finalCashflow)}<span className="text-xs font-sans font-normal text-foreground-muted ml-0.5">/mo</span>
          </div>
        </div>
        {surplusCents !== null && (
          <div>
            <div className="text-[10px] text-foreground-subtle uppercase tracking-[0.07em] mb-0.5">
              {surplusCents + finalCashflow < 0 ? 'Surplus shortfall' : 'Surplus headroom left'}
            </div>
            <div className={`text-lg font-display tabular-nums ${surplusCents + finalCashflow >= 0 ? 'text-positive' : 'text-negative'}`}>
              {fmtMoney(surplusCents + finalCashflow)}<span className="text-xs font-sans font-normal text-foreground-muted ml-0.5">/mo</span>
            </div>
          </div>
        )}
      </div>
      <p className="px-5 pb-4 text-[10px] text-foreground-subtle">
        Forecast only · ignores offset balances and future rate moves
      </p>
    </section>
  )
}

// ── Per-loan rate input ───────────────────────────────────────────────────────

function RateInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(value.toFixed(2))

  useEffect(() => { setRaw(value.toFixed(2)) }, [value])

  return (
    <span className="inline-flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5 bg-surface focus-within:ring-1 focus-within:ring-accent/30">
      <input
        className="w-[3.5ch] text-right text-xs tabular-nums bg-transparent outline-none"
        inputMode="decimal"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(raw)
          if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 30) {
            onChange(parsed)
          } else {
            setRaw(value.toFixed(2))
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span className="text-[10px] text-foreground-muted">%</span>
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterestOnlyPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  const [piRates, setPiRates] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/v1/plan/context')
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

  const onLoanRate = useCallback((loanId: string, rate: number) => {
    setPiRates(prev => ({ ...prev, [loanId]: rate }))
  }, [])

  if (pageState.status === 'loading') {
    return (
      <div>
        <BackToScenarios />
        <div className="flex items-center justify-center py-24 text-sm text-foreground-muted">Loading…</div>
      </div>
    )
  }

  if (pageState.status === 'error') {
    return (
      <div>
        <BackToScenarios />
        <p className="text-sm text-foreground-muted py-8">Failed to load. Refresh to try again.</p>
      </div>
    )
  }

  const { context } = pageState
  const result = computeIoRollover(context.loans, piRates)
  const { rows } = result

  if (rows.length === 0) {
    return (
      <div className="max-w-[920px]">
        <BackToScenarios />
        <div className="mb-6">
          <h1 className="font-display text-2xl text-foreground">Interest-only rollover</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            When your interest-only periods end, can you cover the payment jump?
          </p>
        </div>
        <p className="text-sm text-foreground-muted py-8">
          No interest-only loans with a rollover date recorded. Add an IO end date to your loans to model the payment shock.
        </p>
      </div>
    )
  }

  const n = rows.length
  const spanYears = (() => {
    const today = new Date()
    const axisStart = new Date(today.getFullYear(), 0, 1)
    const lastEnd = parseLocalDate(rows[rows.length - 1].ioEndDate)
    const axisEnd = addMonths(lastEnd, 12)
    return Math.max(1, Math.round((axisEnd.getTime() - axisStart.getTime()) / MS_YEAR) - 1)
  })()

  const isSurplusBreached =
    context.householdSurplusMonthlyCents !== null &&
    result.totalAdditionalMonthlyCents > context.householdSurplusMonthlyCents

  return (
    <div className="max-w-[920px]">
      <BackToScenarios />

      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground">Interest-only rollover</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          When your interest-only periods end, can you cover the payment jump?
        </p>
      </div>

      <div className="flex flex-col gap-6">

        {/* ── Verdict ─────────────────────────────────────────────────── */}
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-7 p-6">
            {/* Lead */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-3">
                Once {n === 1 ? 'the loan rolls' : `all ${n} loans roll`} to P&amp;I
              </p>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-display text-3xl tracking-tight text-negative">
                  {fmtSigned(result.totalAdditionalMonthlyCents)}
                </span>
                <span className="text-sm text-foreground-muted font-medium">/ mo more than today</span>
              </div>
              <p className="text-sm text-foreground-muted leading-snug max-w-[44ch]">
                That&apos;s <strong className="font-semibold text-foreground">{fmtMoney(result.totalAdditionalAnnualCents)}/yr</strong> of extra servicing once{' '}
                {n === 1 ? 'the interest-only period expires' : 'every interest-only period expires'} — estimated at each loan&apos;s P&amp;I rate, its IO rate less {DEFAULT_DISCOUNT.toFixed(2)}% by default.
              </p>
            </div>

            {/* Aside: household capacity */}
            <div className="border-l border-rule pl-7 flex flex-col justify-center">
              {context.householdSurplusMonthlyCents !== null ? (
                <div>
                  <div className="flex justify-between items-baseline text-xs text-foreground-muted mb-2">
                    <span>Surplus consumed once rolled</span>
                    <span className="tabular-nums">
                      <strong className="text-foreground font-semibold">{formatCents(Math.min(result.totalAdditionalMonthlyCents, context.householdSurplusMonthlyCents))}</strong>
                      {' '}of{' '}
                      <strong className="text-foreground font-semibold">{formatCents(context.householdSurplusMonthlyCents)}</strong>
                      {' '}mo
                    </span>
                  </div>
                  <div className="h-2.5 rounded bg-surface-sunken border border-border overflow-hidden mb-2">
                    <div
                      className={`h-full rounded transition-[width] duration-200 ${isSurplusBreached ? 'bg-negative' : 'bg-gradient-to-r from-positive to-warning'}`}
                      style={{ width: context.householdSurplusMonthlyCents > 0 ? `${Math.min(100, Math.round(result.totalAdditionalMonthlyCents / context.householdSurplusMonthlyCents * 100))}%` : '100%' }}
                    />
                  </div>
                  <p className="text-xs text-foreground-muted leading-snug">
                    {isSurplusBreached ? (
                      <>The fully-rolled shortfall <strong className="font-semibold">exceeds</strong> your {formatCents(context.householdSurplusMonthlyCents)}/mo surplus by{' '}
                        <strong className="font-semibold text-negative tabular-nums">{formatCents(result.totalAdditionalMonthlyCents - context.householdSurplusMonthlyCents)}/mo</strong>.
                      </>
                    ) : (
                      <>The fully-rolled position fits inside your <strong className="font-semibold">{formatCents(context.householdSurplusMonthlyCents)}/mo</strong> surplus — leaving{' '}
                        <strong className="font-semibold tabular-nums">{formatCents(context.householdSurplusMonthlyCents - result.totalAdditionalMonthlyCents)}/mo</strong> of headroom.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted leading-snug">
                  <strong className="font-semibold text-foreground">Set up your Household</strong> to see how much of your monthly surplus these rollovers would consume.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Schedule ────────────────────────────────────────────────── */}
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-0.5">
                When each loan rolls over
              </p>
              <p className="text-xs text-foreground-muted">
                {n === 1
                  ? 'One interest-only loan flips to principal & interest.'
                  : `${n} interest-only loans flip to principal & interest over the next ${spanYears} year${spanYears !== 1 ? 's' : ''}.`}
              </p>
            </div>
            <p className="text-[10px] text-foreground-subtle text-right max-w-[28ch] leading-snug shrink-0">
              P&amp;I rate is estimated at IO rate −{DEFAULT_DISCOUNT.toFixed(2)}%.<br />
              Edit below to override per loan.
            </p>
          </div>

          {/* Timeline */}
          <Timeline rows={rows} />

          {/* Per-loan table */}
          <div className="border-t border-rule">
            {/* Header */}
            <div className="grid grid-cols-[minmax(0,1.6fr)_80px_100px_88px_88px_80px] gap-3 px-5 py-3 bg-surface-sunken/50 text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle">
              <div>Loan</div>
              <div className="text-right">IO ends</div>
              <div className="text-right">P&amp;I rate</div>
              <div className="text-right">IO now</div>
              <div className="text-right">After P&amp;I</div>
              <div className="text-right">Δ / mo</div>
            </div>

            {rows.map((row: IoRolloverRow) => (
              <div
                key={row.loanId}
                className="grid grid-cols-[minmax(0,1.6fr)_80px_100px_88px_88px_80px] gap-3 px-5 py-4 border-t border-rule text-sm"
              >
                <div>
                  <span className="block font-semibold text-foreground">{row.nickname ?? row.lender}</span>
                  <span className="block mt-0.5 text-[10px] text-foreground-muted tabular-nums">
                    {row.nickname ? `${row.lender} · ` : ''}{fmtK(row.balanceCents)} · {fmtRate(row.ioRate)} IO
                    {row.loanTermYears && ` · ${row.loanTermYears}yr loan`}
                  </span>
                </div>
                <div className="text-right text-foreground-muted text-xs self-center tabular-nums">
                  {monthLabel(parseLocalDate(row.ioEndDate))}
                </div>
                <div className="text-right self-center">
                  <RateInput
                    value={row.pAndIRate}
                    onChange={rate => onLoanRate(row.loanId, rate)}
                  />
                </div>
                <div className="text-right tabular-nums text-foreground self-center text-sm">
                  {formatCents(row.ioMonthlyRepaymentCents)}
                </div>
                <div className="text-right tabular-nums text-foreground self-center text-sm">
                  {row.termUnknown ? (
                    <span className="text-foreground-muted text-xs">term unknown</span>
                  ) : (
                    formatCents(row.pAndIMonthlyRepaymentCents ?? 0)
                  )}
                </div>
                <div className={`text-right tabular-nums font-semibold self-center ${row.deltaCents !== null && row.deltaCents > 0 ? 'text-negative' : row.deltaCents !== null && row.deltaCents < 0 ? 'text-positive' : 'text-foreground-muted'}`}>
                  {row.termUnknown ? '—' : fmtSigned(row.deltaCents ?? 0)}
                </div>
              </div>
            ))}
          </div>

          <p className="px-5 py-3 text-[10px] text-foreground-subtle border-t border-rule">
            Assumes constant IO rates · IO loans are not refinanced
          </p>
        </div>

        {/* ── Cashflow chart ───────────────────────────────────────────── */}
        <CashflowChart
          rows={rows}
          result={result}
          baseline={context.portfolioBaseline}
          surplusCents={context.householdSurplusMonthlyCents}
        />

        {/* ── Household surplus bar ────────────────────────────────────── */}
        <HouseholdSurplusBar
          surplusCents={context.householdSurplusMonthlyCents}
          consumedCents={result.totalAdditionalMonthlyCents}
          label="IO rollovers would consume"
          action="IO rollover"
        />

      </div>
    </div>
  )
}
