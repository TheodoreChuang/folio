'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Entity } from '@/db/schema'

const VALUATION_SOURCES = [
  'manual_estimate',
  'bank_valuation',
  'agent_appraisal',
  'independent_valuer',
  'comparable_sale',
] as const

const VALUATION_SOURCE_LABELS: Record<string, string> = {
  manual_estimate: 'Manual estimate',
  bank_valuation: 'Bank valuation',
  agent_appraisal: 'Agent appraisal',
  independent_valuer: 'Independent valuer',
  comparable_sale: 'Recent comparable sale',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewPropertyPage() {
  const router = useRouter()

  const [entities, setEntities] = useState<Entity[]>([])
  const [loadingEntities, setLoadingEntities] = useState(true)

  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [entityId, setEntityId] = useState<string | null>(null)

  const [valueDollars, setValueDollars] = useState('')
  const [valuedAt, setValuedAt] = useState(todayIso)
  const [valuationSource, setValuationSource] = useState<typeof VALUATION_SOURCES[number]>('manual_estimate')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/entities')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json() as Promise<{ entities?: Entity[] }>
      })
      .then(data => {
        if (!data) return
        const ents = data.entities ?? []
        setEntities(ents)
        if (ents.length === 1) setEntityId(ents[0].id)
      })
      .catch(() => toast.error('Failed to load entities'))
      .finally(() => setLoadingEntities(false))
  }, [router])

  const isValid = address.trim().length > 0 && startDate !== ''

  async function handleSubmit() {
    if (!isValid) return
    setSaving(true)

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim(),
          nickname: nickname.trim() || null,
          startDate,
          endDate: endDate || null,
          entityId,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to create property')
        return
      }

      const { property } = await res.json() as { property: { id: string } }

      const parsedValue = parseFloat(valueDollars.replace(/,/g, ''))
      if (valueDollars.trim() && !isNaN(parsedValue) && parsedValue > 0) {
        const valuationRes = await fetch(`/api/properties/${property.id}/valuations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valuedAt,
            valueCents: Math.round(parsedValue * 100),
            source: valuationSource,
          }),
        })
        if (!valuationRes.ok) {
          toast.warning('Property created but opening valuation could not be saved')
        }
      }

      toast.success('Property added')
      router.push(`/properties/${property.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-screen-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">

        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-5 transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All properties
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-ink">Add a property</h1>
            <p className="text-sm text-muted mt-0.5">
              Tell us the basics. Folio will learn the rest from your statements.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/properties')} disabled={saving}>
            Cancel
          </Button>
        </div>

        <div className="space-y-6">

          {/* ===== 1. Address ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Address</h3>
                <p className="text-xs text-muted mt-0.5">Where is the property?</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="e.g. 14 Elm Street, Randwick NSW 2031"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nickname">
                  Nickname <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="nickname"
                  placeholder="e.g. Elm St"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                />
                <p className="text-xs text-muted">A short name to refer to this property in the sidebar.</p>
              </div>
            </div>
          </div>

          {/* ===== 2. Acquisition ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Acquisition date</h3>
                <p className="text-xs text-muted mt-0.5">Contract or settlement date — either is fine.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Purchase date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">
                  End date <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
                <p className="text-xs text-muted">If the property has been sold.</p>
              </div>
            </div>
          </div>

          {/* ===== 3. Ownership ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Ownership</h3>
                <p className="text-xs text-muted mt-0.5">Which entity holds the title?</p>
              </div>
            </div>

            {loadingEntities ? (
              <div className="text-sm text-muted">Loading entities…</div>
            ) : entities.length === 0 ? (
              <div className="text-sm text-muted">
                No entities found.{' '}
                <Link href="/entities" className="text-accent hover:underline">Add an entity first →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Entity</Label>
                <div className="mt-1.5 divide-y divide-border border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setEntityId(null)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      entityId === null ? 'bg-accent-light' : 'bg-surface hover:bg-screen-bg',
                    ].join(' ')}
                  >
                    <span className={[
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      entityId === null ? 'border-accent bg-accent' : 'border-border',
                    ].join(' ')}>
                      {entityId === null && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden>
                          <polyline points="2,5 4.2,7.2 8,3"/>
                        </svg>
                      )}
                    </span>
                    <p className="text-sm text-muted italic">None (unlinked)</p>
                  </button>
                  {entities.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEntityId(entityId === e.id ? null : e.id)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        entityId === e.id ? 'bg-accent-light' : 'bg-surface hover:bg-screen-bg',
                      ].join(' ')}
                    >
                      <span className={[
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        entityId === e.id ? 'border-accent bg-accent' : 'border-border',
                      ].join(' ')}>
                        {entityId === e.id && (
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden>
                            <polyline points="2,5 4.2,7.2 8,3"/>
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-muted capitalize">{e.type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ===== 4. Current valuation ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Opening valuation <span className="font-normal text-muted">(optional)</span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">An opening valuation. You can update it any time on the Valuations tab.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="value">Current value ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <Input
                    id="value"
                    type="text"
                    inputMode="decimal"
                    placeholder="920,000"
                    className="pl-7"
                    value={valueDollars}
                    onChange={e => setValueDollars(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valued-at">As of date</Label>
                <Input
                  id="valued-at"
                  type="date"
                  value={valuedAt}
                  onChange={e => setValuedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="val-source">Valuation source</Label>
                <select
                  id="val-source"
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={valuationSource}
                  onChange={e => setValuationSource(e.target.value as typeof VALUATION_SOURCES[number])}
                >
                  {VALUATION_SOURCES.map(s => (
                    <option key={s} value={s}>{VALUATION_SOURCE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!isValid || saving}
            >
              {saving ? 'Saving…' : 'Add property'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/properties')} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
