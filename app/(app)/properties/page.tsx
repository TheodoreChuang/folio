'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MetricTile } from '@/components/ui/metric-tile'
import { Badge } from '@/components/ui/badge'
import { FilterChip } from '@/components/filter-chip'
import type { FilterOption } from '@/components/filter-chip'
import type { Property, Entity, EntityType } from '@/db/schema'
import { formatCents } from '@/lib/format'

type PropertyWithEntity = Property & { entityName: string | null; lvrPercent: number | null }

type LedgerSummaryFlags = {
  missingStatements: string[]
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
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

export default function PropertiesPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<PropertyWithEntity[]>([])
  const [allProperties, setAllProperties] = useState<PropertyWithEntity[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [missingStatements, setMissingStatements] = useState<Set<string>>(new Set())
  const [totalValueCents, setTotalValueCents] = useState<number | null>(null)
  const [totalDebtCents, setTotalDebtCents] = useState<number | null>(null)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)

  const loadData = useCallback(async (entityId: string | null) => {
    setLoading(true)
    try {
      const { from, to } = currentMonthRange()
      const entityQs = entityId ? `?entityId=${entityId}` : ''
      const ledgerParams = new URLSearchParams({ from, to })
      if (entityId) ledgerParams.set('entityId', entityId)

      // Start the unfiltered properties fetch in parallel when a filter is active
      const allPropsPromise = entityId ? fetch('/api/properties') : null

      const [entRes, propsRes, portfolioRes, ledgerRes] = await Promise.all([
        fetch('/api/entities'),
        fetch(`/api/properties${entityQs}`),
        fetch(`/api/portfolio/summary${entityQs}`),
        fetch(`/api/ledger/summary?${ledgerParams}`),
      ])

      if (propsRes.status === 401) { router.push('/login'); return }

      const { entities: rawEntities = [] } = entRes.ok
        ? await entRes.json() as { entities?: Entity[] }
        : { entities: [] }

      const { properties: filteredRaw = [] } = await propsRes.json() as {
        properties?: (Property & { lvrPercent: number | null })[]
      }

      const entityMap = new Map(rawEntities.map(e => [e.id, e]))
      const decorate = (p: Property & { lvrPercent: number | null }): PropertyWithEntity => ({
        ...p,
        entityName: p.entityId ? (entityMap.get(p.entityId)?.name ?? null) : null,
      })

      setEntities(rawEntities)
      setProperties(filteredRaw.map(decorate))

      if (entityId && allPropsPromise) {
        const allRes = await allPropsPromise
        const { properties: allRaw = [] } = await allRes.json() as {
          properties?: (Property & { lvrPercent: number | null })[]
        }
        setAllProperties(allRaw.map(decorate))
      } else {
        setAllProperties(filteredRaw.map(decorate))
      }

      if (portfolioRes.ok) {
        const { portfolio } = await portfolioRes.json() as {
          portfolio: { totalValueCents: number; totalDebtCents: number }
        }
        setTotalValueCents(portfolio.totalValueCents)
        setTotalDebtCents(portfolio.totalDebtCents)
      }

      if (ledgerRes.ok) {
        const { flags } = await ledgerRes.json() as { flags?: LedgerSummaryFlags }
        setMissingStatements(new Set(flags?.missingStatements ?? []))
      }
    } catch {
      toast.error('Failed to load properties')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadData(entityFilter)
  }, [entityFilter, loadData])

  const entityOptions: FilterOption[] = entities.map(e => {
    const count = allProperties.filter(p => p.entityId === e.id).length
    return {
      id: e.id,
      name: e.name,
      subLabel: entityTypeSubLabel(e.type),
      count,
      entityType: e.type,
      disabled: count === 0,
    }
  })

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-foreground">Properties</h1>
          <p className="text-sm text-foreground-muted mt-0.5">{properties.length} {properties.length === 1 ? 'property' : 'properties'}</p>
        </div>
        <Button size="sm" onClick={() => router.push('/properties/new')}>+ Add property</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-7">
        <MetricTile
          label="Total value"
          value={loading ? '…' : totalValueCents !== null ? formatCents(totalValueCents) : '—'}
          foot={<span className="text-xs text-foreground-muted">{properties.length} properties</span>}
        />
        <MetricTile
          label="Total debt"
          value={loading ? '…' : totalDebtCents !== null ? formatCents(totalDebtCents) : '—'}
          secondary
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <FilterChip
          label="Entity"
          labelPlural="entities"
          itemLabel="properties"
          value={entityFilter}
          options={entityOptions}
          onChange={setEntityFilter}
          variant="rich"
          actionLink={{ href: '/entities', label: 'Add or manage entities' }}
        />
      </div>

      {loading ? (
        <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-foreground-muted">
          Loading properties…
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-foreground-muted mb-3">
            {allProperties.length === 0 ? 'No properties yet.' : 'No properties match the filter.'}
          </p>
          {allProperties.length === 0 && (
            <Button size="sm" onClick={() => router.push('/properties/new')}>+ Add your first property</Button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Property</th>
                <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Entity</th>
                <th className="text-center font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Statement</th>
                <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">LVR</th>
              </tr>
            </thead>
            <tbody>
              {properties.map(prop => {
                const hasMissing = missingStatements.has(prop.id)
                const isSold = !!prop.saleDate
                return (
                  <tr
                    key={prop.id}
                    className={[
                      'border-b border-rule last:border-b-0 hover:bg-background cursor-pointer transition-colors',
                      isSold ? 'opacity-60' : '',
                    ].join(' ')}
                    onClick={() => router.push(`/properties/${prop.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{prop.address}</p>
                        {isSold && (
                          <Badge variant="complete">Sold</Badge>
                        )}
                      </div>
                      {prop.nickname && <p className="text-xs text-foreground-muted mt-0.5">{prop.nickname}</p>}
                    </td>
                    <td className="py-3 px-4 text-foreground-muted">{prop.entityName ?? '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {isSold ? (
                        <span className="text-xs text-foreground-muted">—</span>
                      ) : (
                        <Badge variant={hasMissing ? 'missing' : 'complete'}>
                          {hasMissing ? 'Missing' : 'Complete'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground-muted">
                      {prop.lvrPercent !== null ? `${prop.lvrPercent}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {properties.length > 0 && (
        <div className="mt-4 text-center">
          <Link href="/properties/new" className="text-xs text-accent hover:underline">+ Add another property</Link>
        </div>
      )}
    </div>
  )
}
