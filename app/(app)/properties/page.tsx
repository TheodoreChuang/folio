'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MetricTile } from '@/components/ui/metric-tile'
import { Badge } from '@/components/ui/badge'
import type { Property, Entity } from '@/db/schema'
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

export default function PropertiesPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<PropertyWithEntity[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [missingStatements, setMissingStatements] = useState<Set<string>>(new Set())
  const [totalValueCents, setTotalValueCents] = useState<number | null>(null)
  const [totalDebtCents, setTotalDebtCents] = useState<number | null>(null)
  const [entityFilter, setEntityFilter] = useState<string>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const propsRes = await fetch('/api/properties')
        if (propsRes.status === 401) { router.push('/login'); return }
        const { properties: rawProps = [] } = await propsRes.json() as { properties?: (Property & { lvrPercent: number | null })[] }

        const [entitiesRes, portfolioRes, ledgerRes] = await Promise.all([
          fetch('/api/entities'),
          fetch('/api/portfolio/summary'),
          fetch(`/api/ledger/summary?from=${currentMonthRange().from}&to=${currentMonthRange().to}`),
        ])

        const { entities: rawEntities = [] } = entitiesRes.ok
          ? await entitiesRes.json() as { entities?: Entity[] }
          : { entities: [] }

        const entityMap = new Map(rawEntities.map((e: Entity) => [e.id, e.name]))

        setEntities(rawEntities)
        setProperties(rawProps.map(p => ({
          ...p,
          entityName: p.entityId ? (entityMap.get(p.entityId) ?? null) : null,
        })))

        if (portfolioRes.ok) {
          const { portfolio } = await portfolioRes.json() as { portfolio: { totalValueCents: number; totalDebtCents: number } }
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
    }
    load()
  }, [router])

  const filtered = entityFilter === 'all'
    ? properties
    : properties.filter(p => p.entityId === entityFilter)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-ink">Properties</h1>
          <p className="text-sm text-muted mt-0.5">{properties.length} {properties.length === 1 ? 'property' : 'properties'}</p>
        </div>
        <Button size="sm" onClick={() => router.push('/properties/new')}>+ Add property</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-7">
        <MetricTile
          label="Total value"
          value={totalValueCents !== null ? formatCents(totalValueCents) : '—'}
          foot={<span className="text-xs text-muted">{properties.length} properties</span>}
        />
        <MetricTile
          label="Total debt"
          value={totalDebtCents !== null ? formatCents(totalDebtCents) : '—'}
          secondary
        />
      </div>

      {entities.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-muted font-medium">Filter</span>
          <button
            onClick={() => setEntityFilter('all')}
            className={[
              'text-xs px-2.5 py-1 rounded-full border transition-colors',
              entityFilter === 'all'
                ? 'bg-accent text-white border-accent'
                : 'border-border text-muted hover:border-accent hover:text-ink',
            ].join(' ')}
          >
            All entities
          </button>
          {entities.map(e => (
            <button
              key={e.id}
              onClick={() => setEntityFilter(entityFilter === e.id ? 'all' : e.id)}
              className={[
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                entityFilter === e.id
                  ? 'bg-accent text-white border-accent'
                  : 'border-border text-muted hover:border-accent hover:text-ink',
              ].join(' ')}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted mb-3">
            {properties.length === 0 ? 'No properties yet.' : 'No properties match the filter.'}
          </p>
          {properties.length === 0 && (
            <Button size="sm" onClick={() => router.push('/properties/new')}>+ Add your first property</Button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-screen-bg">
                <th className="text-left font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Property</th>
                <th className="text-left font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Entity</th>
                <th className="text-center font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Statement</th>
                <th className="text-right font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">LVR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(prop => {
                const hasMissing = missingStatements.has(prop.id)
                const isSold = !!prop.saleDate
                return (
                  <tr
                    key={prop.id}
                    className={[
                      'border-b border-ruled last:border-b-0 hover:bg-screen-bg cursor-pointer transition-colors',
                      isSold ? 'opacity-60' : '',
                    ].join(' ')}
                    onClick={() => router.push(`/properties/${prop.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink">{prop.address}</p>
                        {isSold && (
                          <Badge variant="complete">Sold</Badge>
                        )}
                      </div>
                      {prop.nickname && <p className="text-xs text-muted mt-0.5">{prop.nickname}</p>}
                    </td>
                    <td className="py-3 px-4 text-muted">{prop.entityName ?? '—'}</td>
                    <td className="py-3 px-4 text-center">
                      {isSold ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <Badge variant={hasMissing ? 'missing' : 'complete'}>
                          {hasMissing ? 'Missing' : 'Complete'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-muted">
                      {prop.lvrPercent !== null ? `${prop.lvrPercent}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 text-center">
          <Link href="/properties/new" className="text-xs text-accent hover:underline">+ Add another property</Link>
        </div>
      )}
    </div>
  )
}
