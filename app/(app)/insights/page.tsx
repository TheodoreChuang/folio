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
import { SectionLabel } from '@/components/ui/section-label'
import { FilterChip } from '@/components/filter-chip'
import type { FilterOption } from '@/components/filter-chip'
import type { Entity, Property } from '@/db/schema'
import { entityTypeSubLabel } from '@/lib/format'
import type { InsightsReturn } from '@/lib/aggregate'
import {
  periodToDateRange,
  periodLabel,
  periodSubtitle,
  periodMeta,
} from '@/lib/period'
import type { PeriodKey } from '@/lib/period'
import type { TrendPoint } from '@/app/api/reports/trends/route'

// ---------- chart config ----------

const cashflowChartConfig = {
  rent:     { label: 'Rent',            color: 'hsl(152 38% 30% / 0.55)' },
  expenses: { label: 'Expenses',        color: 'hsl(14 58% 42% / 0.5)' },
  mortgage: { label: 'Loan repayments', color: 'hsl(32 6% 38% / 0.45)' },
  net:      { label: 'Net',             color: 'hsl(188 32% 32%)' },
} satisfies ChartConfig

type ChartPoint = {
  label: string
  month: string
  rent: number | null
  expenses: number | null
  mortgage: number | null
  net: number | null
}

// ---------- formatting ----------

function formatPct(n: number | null, sign = false): string {
  if (n === null) return '—'
  const prefix = sign && n > 0 ? '+' : ''
  return `${prefix}${n.toFixed(1)}%`
}

function formatMoney(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 1_000_000_00) {
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

// ---------- period options ----------

const PERIOD_KEYS: PeriodKey[] = ['12m', 'this-fy', 'last-fy', '6m', 'all-time']

// ---------- page ----------

export default function InsightsPage() {
  const router = useRouter()
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodKey>('12m')
  const [insightsReturn, setInsightsReturn] = useState<InsightsReturn | null>(null)
  const [trends, setTrends] = useState<TrendPoint[] | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [properties, setProperties] = useState<Pick<Property, 'id' | 'entityId'>[]>([])

  const loadData = useCallback(async (entityId: string | null, p: PeriodKey, signal?: AbortSignal) => {
    try {
      const { from, to } = periodToDateRange(p)
      const entityQs = entityId ? `&entityId=${entityId}` : ''
      // Trends chart: use 12m window when period is 'all-time' (24-month API cap)
      const { from: tFrom, to: tTo } =
        p === 'all-time' ? periodToDateRange('12m') : { from, to }

      const [returnRes, trendsRes] = await Promise.all([
        fetch(`/api/portfolio/return?from=${from}&to=${to}${entityQs}`, { signal }),
        fetch(`/api/reports/trends?from=${tFrom}&to=${tTo}${entityQs}`, { signal }),
      ])

      if (signal?.aborted) return

      if (returnRes.status === 401) { router.push('/login'); return }

      setInsightsReturn(
        returnRes.ok
          ? (await returnRes.json() as { return: InsightsReturn }).return
          : null,
      )
      setTrends(
        trendsRes.ok
          ? (await trendsRes.json() as { trends: TrendPoint[] }).trends
          : null,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }, [router])

  useEffect(() => {
    const controller = new AbortController()
    loadData(entityFilter, period, controller.signal)
    return () => controller.abort()
  }, [entityFilter, period, loadData])

  useEffect(() => {
    void fetch('/api/entities')
      .then(r => r.ok ? r.json() : null)
      .then((data: { entities?: Entity[] } | null) => {
        if (data?.entities) setEntities(data.entities)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    void fetch('/api/properties')
      .then(r => r.ok ? r.json() : null)
      .then((data: { properties?: Pick<Property, 'id' | 'entityId'>[] } | null) => {
        if (data?.properties) setProperties(data.properties)
      })
      .catch(() => null)
  }, [])

  // --- filter options ---

  const entityOptions: FilterOption[] = entities.map(e => ({
    id:         e.id,
    name:       e.name,
    subLabel:   entityTypeSubLabel(e.type),
    count:      properties.filter(p => p.entityId === e.id).length,
    entityType: e.type,
  }))

  const periodOptions: FilterOption[] = PERIOD_KEYS.map(key => ({
    id:    key,
    name:  periodLabel(key),
    meta:  periodMeta(key),
    count: 0,
  }))

  // --- chart data ---

  const chartData: ChartPoint[] = (trends ?? []).map(pt => ({
    label:    pt.month.slice(5),
    month:    pt.month,
    rent:     pt.hasData ? pt.rentCents / 100 : null,
    expenses: pt.hasData ? -(pt.expensesCents / 100) : null,
    mortgage: pt.hasData ? -(pt.mortgageCents / 100) : null,
    net:      pt.hasData ? pt.netCents / 100 : null,
  }))

  return (
    <div className="space-y-8">
      {/* Page head */}
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Insights</h1>
          <p className="font-display italic font-light text-foreground-muted text-lg mt-1.5 leading-snug">
            {periodSubtitle(period)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FilterChip
            label="Entity"
            labelPlural="entities"
            value={entityFilter}
            options={entityOptions}
            onChange={setEntityFilter}
            variant="rich"
            align="end"
            actionLink={{ href: '/entities', label: 'Add or manage entities' }}
          />
          <FilterChip
            label="Period"
            value={period}
            options={periodOptions}
            onChange={(id) => { if (id) setPeriod(id as PeriodKey) }}
            variant="simple"
            align="end"
          />
        </div>
      </div>

      {/* Return metrics */}
      <div>
        <SectionLabel>Return · {periodLabel(period)}</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          <MetricTile
            label="Gross yield"
            value={formatPct(insightsReturn?.grossYieldPct ?? null)}
            foot={insightsReturn ? (
              <span className="text-foreground-muted">
                {formatMoney(insightsReturn.annualisedRentCents)} / yr on {formatMillions(insightsReturn.currentValueCents)}
              </span>
            ) : undefined}
          />
          <MetricTile
            label="Capital growth"
            value={formatPct(insightsReturn?.capitalGrowthPct ?? null, true)}
            foot={insightsReturn?.capitalGrowthCents != null ? (
              <span className={insightsReturn.capitalGrowthCents >= 0 ? 'text-positive' : 'text-negative'}>
                {formatMoney(insightsReturn.capitalGrowthCents)}
              </span>
            ) : undefined}
          />
          <MetricTile
            label="Total return"
            value={formatPct(insightsReturn?.totalReturnPct ?? null, true)}
          />
        </div>
      </div>

      {/* Cashflow chart */}
      <div>
        <SectionLabel>
          Cashflow · {period === 'all-time' ? 'last 24 months' : periodLabel(period)}
          <span className="ml-2 text-[10px] font-normal tracking-normal text-foreground-muted normal-case">
            — portfolio operating cashflow
          </span>
        </SectionLabel>
        <div className="bg-surface border border-border rounded-[7px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Monthly cashflow composition</span>
            <div className="flex items-center gap-4 text-xs text-foreground-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(152 38% 30% / 0.55)' }} />
                Rent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(14 58% 42% / 0.5)' }} />
                Expenses
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(32 6% 38% / 0.45)' }} />
                Loan repayments
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-0.5 rounded-sm" style={{ background: 'hsl(188 32% 32%)' }} />
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
              <Bar dataKey="rent"     stackId="positive" fill="hsl(152 38% 30% / 0.55)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expenses" stackId="negative" fill="hsl(14 58% 42% / 0.5)"   radius={[0, 0, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="mortgage" stackId="negative" fill="hsl(32 6% 38% / 0.45)"   radius={[0, 0, 2, 2]} isAnimationActive={false} />
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
