'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { MetricTile } from '@/components/ui/metric-tile'
import { LvrMeter } from '@/components/ui/lvr-meter'
import { Prompt } from '@/components/ui/prompt'
import { SectionLabel } from '@/components/ui/section-label'
import { FilterChip } from '@/components/filter-chip'
import type { FilterOption } from '@/components/filter-chip'
import type { Entity, EntityType } from '@/db/schema'
import type { ReportTotals } from '@/lib/aggregate'
import type { TrendPoint } from '@/app/api/reports/trends/route'
import type { PortfolioLVR } from '@/app/api/portfolio/summary/route'

// ---------- helpers ----------

type PeriodKey = '12m' | '6m' | 'this-fy' | 'last-fy'

function periodToDateRange(period: PeriodKey): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (period === '12m' || period === '6m') {
    const n = period === '12m' ? 12 : 6
    const start = new Date(year, month - n, 1)
    const sy = start.getFullYear()
    const sm = String(start.getMonth() + 1).padStart(2, '0')
    const endDay = new Date(year, month, 0).getDate()
    return {
      from: `${sy}-${sm}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-${endDay}`,
    }
  }

  // Australian FY: July 1 – June 30
  const fyStartYear = month >= 7 ? year : year - 1
  if (period === 'this-fy') {
    return { from: `${fyStartYear}-07-01`, to: `${fyStartYear + 1}-06-30` }
  }
  return { from: `${fyStartYear - 1}-07-01`, to: `${fyStartYear}-06-30` }
}

function periodLabel(period: PeriodKey): string {
  if (period === '12m') return 'last 12 months'
  if (period === '6m') return 'last 6 months'
  const { from } = periodToDateRange(period)
  const fy = parseInt(from.slice(0, 4))
  return `FY ${fy}–${String(fy + 1).slice(2)}`
}

function periodSubLabel(period: PeriodKey): string {
  const { from, to } = periodToDateRange(period)
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
  }
  return `${fmt(from)} – ${fmt(to)}`
}

function entityTypeSubLabel(type: EntityType): string {
  switch (type) {
    case 'trust': return 'Discretionary trust'
    case 'individual': return 'Individual'
    case 'company': return 'Company'
    case 'joint': return 'Joint'
    case 'superannuation': return 'Superannuation'
  }
}

function formatMoney(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 100_000_000).toFixed(2)}m`
  }
  if (abs >= 100_000) {
    return `${sign}$${Math.round(abs / 100_000)}k`
  }
  return `${sign}$${(abs / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatMillions(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 1_000_000_00) {
    return `${sign}$${(abs / 100_000_000).toFixed(2)}m`
  }
  return `${sign}$${Math.round(abs / 100_000)}k`
}

// ---------- types ----------

type LedgerSummaryResponse = {
  totals: ReportTotals
  flags: {
    missingStatements: string[]
    missingMortgages: unknown[]
  }
}

type PlanContextSummary = {
  householdSurplusMonthlyCents: number | null
}

// ---------- chart config ----------

const cashflowChartConfig = {
  rent:     { label: 'Rent',             color: 'hsl(152 38% 30% / 0.55)' },
  expenses: { label: 'Expenses',         color: 'hsl(14 58% 42% / 0.5)' },
  mortgage: { label: 'Loan repayments',  color: 'hsl(32 6% 38% / 0.45)' },
  net:      { label: 'Net',              color: 'hsl(188 32% 32%)' },
} satisfies ChartConfig

type ChartPoint = {
  label: string
  month: string
  rent: number | null
  expenses: number | null
  mortgage: number | null
  net: number | null
}

// ---------- page ----------

export default function DashboardPage() {
  const router = useRouter()
  const [portfolio, setPortfolio] = useState<PortfolioLVR | null>(null)
  const [ledger, setLedger] = useState<LedgerSummaryResponse | null>(null)
  const [trends, setTrends] = useState<TrendPoint[] | null>(null)
  const [planContext, setPlanContext] = useState<PlanContextSummary | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodKey>('12m')

  const loadDashboard = useCallback(async (entityId: string | null, p: PeriodKey) => {
    try {
      const { from, to } = periodToDateRange(p)
      const entityQs = entityId ? `&entityId=${entityId}` : ''
      const portfolioQs = entityId ? `?entityId=${entityId}` : ''

      const [portfolioRes, ledgerRes, trendsRes] = await Promise.all([
        fetch(`/api/portfolio/summary${portfolioQs}`),
        fetch(`/api/ledger/summary?from=${from}&to=${to}${entityQs}`),
        fetch(`/api/reports/trends?from=${from}&to=${to}${entityQs}`),
      ])

      if (portfolioRes.status === 401) { router.push('/login'); return }

      setPortfolio(portfolioRes.ok
        ? (await portfolioRes.json() as { portfolio: PortfolioLVR }).portfolio
        : null)
      setLedger(ledgerRes.ok ? await ledgerRes.json() as LedgerSummaryResponse : null)
      setTrends(trendsRes.ok
        ? (await trendsRes.json() as { trends: TrendPoint[] }).trends
        : null)
    } catch {
      // silent — stale state shown until next load
    }
  }, [router])

  useEffect(() => {
    loadDashboard(entityFilter, period)
  }, [entityFilter, period, loadDashboard])

  useEffect(() => {
    void fetch('/api/entities')
      .then(r => r.ok ? r.json() : null)
      .then((data: { entities?: Entity[] } | null) => {
        if (data?.entities) setEntities(data.entities)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    void fetch('/api/plan/context')
      .then(r => r.ok ? r.json() : null)
      .then((data: { context?: PlanContextSummary } | null) => {
        if (data?.context) setPlanContext(data.context)
      })
      .catch(() => null)
  }, [])

  // --- derived values ---

  const totalValueCents = portfolio?.totalValueCents ?? 0
  const totalDebtCents = portfolio?.totalDebtCents ?? 0
  const netEquityCents = totalValueCents - totalDebtCents
  const lvrPct = portfolio?.lvr ?? null
  const netCashflow = ledger?.totals.netAfterMortgage ?? null

  const personalSurplus = planContext?.householdSurplusMonthlyCents ?? null
  const portfolioCashflow = netCashflow
  const totalSurplus = personalSurplus !== null && portfolioCashflow !== null
    ? personalSurplus + portfolioCashflow
    : null

  const missingProperties = ledger
    ? ledger.totals.properties.filter(p => !p.hasStatement)
    : []

  const chartData: ChartPoint[] = (trends ?? []).map(pt => ({
    label: pt.month.slice(5),
    month: pt.month,
    rent:     pt.hasData ? pt.rentCents / 100 : null,
    expenses: pt.hasData ? -(pt.expensesCents / 100) : null,
    mortgage: pt.hasData ? -(pt.mortgageCents / 100) : null,
    net:      pt.hasData ? pt.netCents / 100 : null,
  }))

  const monthLabel = (() => {
    const now = new Date()
    return now.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
  })()

  // --- filter options ---

  const entityOptions: FilterOption[] = entities.map(e => ({
    id: e.id,
    name: e.name,
    subLabel: entityTypeSubLabel(e.type),
    count: 0,
    entityType: e.type,
  }))

  const periodOptions: FilterOption[] = [
    { id: '12m',     name: 'Last 12 months',     subLabel: periodSubLabel('12m'),     count: 0 },
    { id: '6m',      name: 'Last 6 months',       subLabel: periodSubLabel('6m'),      count: 0 },
    { id: 'this-fy', name: 'This financial year', subLabel: periodSubLabel('this-fy'), count: 0 },
    { id: 'last-fy', name: 'Last financial year', subLabel: periodSubLabel('last-fy'), count: 0 },
  ]

  return (
    <div className="space-y-8">
      {/* Page head */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Portfolio</h1>
          <FilterChip
            label="Period"
            labelPlural="periods"
            value={period}
            options={periodOptions}
            onChange={(v) => setPeriod((v ?? '12m') as PeriodKey)}
            variant="simple"
            align="end"
          />
        </div>
        <div className="flex items-center gap-2">
          <FilterChip
            label="Entity"
            labelPlural="entities"
            value={entityFilter}
            options={entityOptions}
            onChange={setEntityFilter}
            variant="rich"
            actionLink={{ href: '/entities', label: 'Add or manage entities' }}
          />
        </div>
      </div>

      {/* Prompts strip — statement completeness only */}
      {missingProperties.length > 0 && (
        <div>
          <SectionLabel>Needs your attention</SectionLabel>
          <Prompt
            tone="action"
            severity="Action needed"
            message={
              <>
                Statements not yet received for:{' '}
                {missingProperties.map(p => p.nickname ?? p.address).join(', ')}
              </>
            }
          />
        </div>
      )}

      {/* Portfolio metrics */}
      <div>
        <SectionLabel>Portfolio position · {monthLabel}</SectionLabel>
        <div className="grid grid-cols-5 gap-4">
          <MetricTile
            label="Total value"
            value={formatMillions(totalValueCents)}
          />
          <MetricTile
            label="Total debt"
            value={formatMillions(totalDebtCents)}
          />
          <MetricTile
            label="Net equity"
            value={formatMillions(netEquityCents)}
          />
          <MetricTile
            label="Portfolio LVR"
            value={lvrPct !== null ? `${lvrPct}%` : '—'}
            foot={
              lvrPct !== null ? (
                <LvrMeter value={lvrPct / 100} className="w-full" />
              ) : undefined
            }
          />
          <MetricTile
            label="Net cashflow · monthly"
            value={netCashflow !== null ? formatMoney(netCashflow) : '—'}
            valueClassName={netCashflow !== null && netCashflow < 0 ? 'text-negative' : undefined}
          />
        </div>
      </div>

      {/* Serviceability */}
      {portfolioCashflow !== null && (
        <div>
          <SectionLabel>
            Serviceability · monthly
            <span className="ml-2 text-[10px] font-normal tracking-normal text-foreground-muted normal-case">
              — can the household carry the portfolio?
            </span>
          </SectionLabel>
          {personalSurplus !== null ? (
            <div className="flex items-stretch gap-3">
              <MetricTile
                label="Personal surplus"
                value={formatMoney(personalSurplus)}
                valueClassName={personalSurplus < 0 ? 'text-negative' : undefined}
                foot={<span className="tag-est text-[10px] font-medium text-foreground-muted">Estimated · from Household</span>}
                className="flex-1"
              />
              <div className="flex items-center text-2xl font-light text-foreground-subtle px-1">+</div>
              <MetricTile
                label="Portfolio cashflow"
                value={formatMoney(portfolioCashflow)}
                valueClassName={portfolioCashflow < 0 ? 'text-negative' : undefined}
                foot={<span className="text-foreground-muted">after loan repayments</span>}
                className="flex-1"
              />
              <div className="flex items-center text-2xl font-light text-foreground-subtle px-1">=</div>
              <MetricTile
                label="Total surplus"
                value={formatMoney(totalSurplus ?? 0)}
                valueClassName={(totalSurplus ?? 0) < 0 ? 'text-negative' : undefined}
                foot={
                  <span className="text-foreground-muted">
                    {(totalSurplus ?? 0) >= 0 ? '+' : ''}{formatMoney((totalSurplus ?? 0) * 12)} / yr
                  </span>
                }
                className="flex-1 border-accent/35 bg-accent-soft/50"
              />
            </div>
          ) : (
            <div className="flex items-stretch gap-3">
              <MetricTile
                label="Portfolio cashflow"
                value={formatMoney(portfolioCashflow)}
                valueClassName={portfolioCashflow < 0 ? 'text-negative' : undefined}
                foot={<span className="text-foreground-muted">after loan repayments</span>}
                className="flex-1"
              />
              <div className="flex-1 flex items-center">
                <p className="text-sm text-foreground-muted">
                  Add a <a href="/household" className="text-accent hover:underline">household budget</a> to see your full serviceability picture.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cashflow trend chart */}
      <div>
        <SectionLabel>Cashflow trend · {periodLabel(period)}</SectionLabel>
        <div className="bg-surface border border-border rounded-[7px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Monthly cashflow composition</span>
            <div className="flex items-center gap-4 text-xs text-foreground-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(152 38% 30% / 0.55)' }}
                />
                Rent
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(14 58% 42% / 0.5)' }}
                />
                Expenses
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(32 6% 38% / 0.45)' }}
                />
                Loan repayments
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-0.5 rounded-sm"
                  style={{ background: 'hsl(188 32% 32%)' }}
                />
                Net
              </span>
            </div>
          </div>
          <ChartContainer config={cashflowChartConfig} className="h-[220px] w-full">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => {
                  const abs = Math.abs(v as number)
                  if (abs >= 1000) return `${(v as number) < 0 ? '−' : ''}$${abs / 1000}k`
                  return `$${v}`
                }}
                width={48}
              />
              <ReferenceLine y={0} stroke="hsl(36 12% 86%)" strokeWidth={1} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {/* Rent — positive stack */}
              <Bar
                dataKey="rent"
                stackId="positive"
                fill="hsl(152 38% 30% / 0.55)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              {/* Expenses — negative stack */}
              <Bar
                dataKey="expenses"
                stackId="negative"
                fill="hsl(14 58% 42% / 0.5)"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              {/* Mortgage — stacked on expenses below zero */}
              <Bar
                dataKey="mortgage"
                stackId="negative"
                fill="hsl(32 6% 38% / 0.45)"
                radius={[0, 0, 2, 2]}
                isAnimationActive={false}
              />
              {/* Net cashflow line */}
              <Line
                dataKey="net"
                stroke="hsl(188 32% 32%)"
                strokeWidth={1.6}
                dot={{ r: 2.2, fill: 'hsl(188 32% 32%)', strokeWidth: 0 }}
                activeDot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  )
}
