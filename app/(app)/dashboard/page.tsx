'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MetricTile } from '@/components/ui/metric-tile'
import { LvrMeter } from '@/components/ui/lvr-meter'
import { Prompt } from '@/components/ui/prompt'
import { SectionLabel } from '@/components/ui/section-label'
import { FilterChip } from '@/components/filter-chip'
import type { FilterOption } from '@/components/filter-chip'
import type { Entity, Property } from '@/db/schema'
import { entityTypeSubLabel } from '@/lib/format'
import type { ReportTotals } from '@/lib/aggregate'
import type { PortfolioLVR } from '@/app/api/portfolio/summary/route'

// ---------- helpers ----------

function rollingDateRange(months: number): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const start = new Date(year, month - months, 1)
  const sy = start.getFullYear()
  const sm = String(start.getMonth() + 1).padStart(2, '0')
  const endDay = new Date(year, month, 0).getDate()
  return {
    from: `${sy}-${sm}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${endDay}`,
  }
}


function buildSubtitle(
  entityFilter: string | null,
  properties: Pick<Property, 'id' | 'entityId'>[] | null,
  entities: Entity[],
  monthStr: string,
): string | null {
  if (properties === null) return null

  const suffix = `current to ${monthStr}`

  if (entityFilter) {
    const entity = entities.find(e => e.id === entityFilter)
    const count = properties.filter(p => p.entityId === entityFilter).length
    const name = entity?.name ?? 'Selected entity'
    const propPhrase = count === 0 ? 'no properties' : count === 1 ? '1 property' : `${count} properties`
    return `${name} · ${propPhrase} · ${suffix}`
  }

  const count = properties.length
  if (count === 0) return `No properties yet · ${suffix}`

  const entityIds = new Set(properties.map(p => p.entityId).filter(Boolean))
  const entityCount = entityIds.size
  const propWord = count === 1 ? 'property' : 'properties'
  const entWord = entityCount === 1 ? 'entity' : 'entities'
  if (entityCount > 0) {
    return `${count} ${propWord} across ${entityCount} ${entWord} · ${suffix}`
  }
  return `${count} ${propWord} · ${suffix}`
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

// ---------- page ----------

export default function DashboardPage() {
  const router = useRouter()
  const [portfolio, setPortfolio] = useState<PortfolioLVR | null>(null)
  const [ledger, setLedger] = useState<LedgerSummaryResponse | null>(null)
  const [planContext, setPlanContext] = useState<PlanContextSummary | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [properties, setProperties] = useState<Pick<Property, 'id' | 'entityId'>[] | null>(null)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)

  const loadDashboard = useCallback(async (entityId: string | null, signal?: AbortSignal) => {
    try {
      const { from, to } = rollingDateRange(12)
      const entityQs = entityId ? `&entityId=${entityId}` : ''
      const portfolioQs = entityId ? `?entityId=${entityId}` : ''

      const [portfolioRes, ledgerRes] = await Promise.all([
        fetch(`/api/portfolio/summary${portfolioQs}`, { signal }),
        fetch(`/api/ledger/summary?from=${from}&to=${to}${entityQs}`, { signal }),
      ])

      if (signal?.aborted) return

      if (portfolioRes.status === 401) { router.push('/login'); return }

      setPortfolio(portfolioRes.ok
        ? (await portfolioRes.json() as { portfolio: PortfolioLVR }).portfolio
        : null)
      setLedger(ledgerRes.ok ? await ledgerRes.json() as LedgerSummaryResponse : null)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // silent — stale state shown until next load
    }
  }, [router])

  useEffect(() => {
    const controller = new AbortController()
    loadDashboard(entityFilter, controller.signal)
    return () => controller.abort()
  }, [entityFilter, loadDashboard])

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

  useEffect(() => {
    void fetch('/api/plan/context')
      .then(r => r.ok ? r.json() : null)
      .then((data: { context?: PlanContextSummary } | null) => {
        if (data?.context) setPlanContext(data.context)
      })
      .catch(() => null)
  }, [])

  // --- derived values ---

  const monthLabel = new Date().toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
  const subtitle = buildSubtitle(entityFilter, properties, entities, monthLabel)
  const totalValueCents = portfolio?.totalValueCents ?? 0
  const totalDebtCents = portfolio?.totalDebtCents ?? 0
  const netEquityCents = totalValueCents - totalDebtCents
  const lvrPct = portfolio?.lvr ?? null
  const loanCount = portfolio?.loansWithBalance ?? null
  const equityPct = totalValueCents > 0 ? Math.round((netEquityCents / totalValueCents) * 100) : null
  const lvrLabel = lvrPct === null ? null
    : lvrPct < 60 ? 'Healthy · < 60%'
    : lvrPct < 75 ? 'Elevated · 60–75%'
    : 'High · > 75%'
  const netCashflow = ledger ? ledger.totals.netAfterMortgage / 12 : null

  const personalSurplus = planContext?.householdSurplusMonthlyCents ?? null
  const portfolioCashflow = netCashflow
  const totalSurplus = personalSurplus !== null && portfolioCashflow !== null
    ? personalSurplus + portfolioCashflow
    : null

  const missingProperties = ledger
    ? ledger.totals.properties.filter(p => !p.hasStatement)
    : []

  // --- filter options ---

  const entityOptions: FilterOption[] = entities.map(e => ({
    id: e.id,
    name: e.name,
    subLabel: entityTypeSubLabel(e.type),
    count: properties?.filter(p => p.entityId === e.id).length ?? 0,
    entityType: e.type,
  }))

  return (
    <div className="space-y-8">
      {/* Page head */}
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Portfolio</h1>
          {subtitle && (
            <p className="font-display italic font-light text-foreground-muted text-lg mt-1.5 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
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
        <div className="grid grid-cols-4 gap-4">
          <MetricTile
            label="Total value"
            value={formatMillions(totalValueCents)}
            foot={portfolio !== null ? <span className="text-foreground-muted">{portfolio.propertiesTotal} {portfolio.propertiesTotal === 1 ? 'property' : 'properties'}</span> : undefined}
          />
          <MetricTile
            label="Total debt"
            value={formatMillions(totalDebtCents)}
            foot={loanCount !== null ? <span className="text-foreground-muted">{loanCount} {loanCount === 1 ? 'loan' : 'loans'}</span> : undefined}
          />
          <MetricTile
            label="Net equity"
            value={formatMillions(netEquityCents)}
            foot={equityPct !== null ? <span className="text-foreground-muted">{equityPct}% of value</span> : undefined}
          />
          <MetricTile
            label="Portfolio LVR"
            value={lvrPct !== null ? `${lvrPct}%` : '—'}
            foot={
              lvrPct !== null ? (
                <div className="flex flex-col gap-2 w-full">
                  <LvrMeter value={lvrPct / 100} className="w-full" />
                  {lvrLabel && <span>{lvrLabel}</span>}
                </div>
              ) : undefined
            }
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
                foot={<span className="text-foreground-muted">after loan repayments · 12-mo avg</span>}
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
                foot={<span className="text-foreground-muted">after loan repayments · 12-mo avg</span>}
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

    </div>
  )
}
