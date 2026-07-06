'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import { STATUS_META, formatDateTime } from './status'
import type { SourceDocument } from '@/db/schema'

type DocumentSummary = {
  id: string
  fileName: string
  propertyId: string | null
  status: SourceDocument['status']
  periodStart: string | null
  periodEnd: string | null
  replacesSourceDocumentId: string | null
  uploadedAt: string
}

type PropertyOption = { id: string; address: string; nickname: string | null }

function propertyLabel(p: PropertyOption): string {
  return p.nickname ? `${p.address} — ${p.nickname}` : p.address
}

// R24: periods overlap when documents share a property and their [start, end] date
// ranges intersect. Compared as ISO date strings (YYYY-MM-DD), which sort/compare
// lexically the same as chronologically.
function periodsOverlap(a: DocumentSummary, b: DocumentSummary): boolean {
  if (!a.periodStart || !a.periodEnd || !b.periodStart || !b.periodEnd) return false
  return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd
}

function computeOverlappingIds(docs: DocumentSummary[]): Set<string> {
  const confirmed = docs.filter(d => d.status === 'confirmed')
  const overlapping = new Set<string>()
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      if (periodsOverlap(confirmed[i], confirmed[j])) {
        overlapping.add(confirmed[i].id)
        overlapping.add(confirmed[j].id)
      }
    }
  }
  return overlapping
}

function periodLabel(doc: DocumentSummary): string {
  if (!doc.periodStart && !doc.periodEnd) return 'No period recorded'
  return `${formatDate(doc.periodStart)} – ${formatDate(doc.periodEnd)}`
}

export default function UploadsListPage() {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, propsRes] = await Promise.all([
        fetch('/api/v1/documents'),
        fetch('/api/v1/properties'),
      ])
      if (!docsRes.ok) { toast.error('Failed to load uploads'); return }
      const docsData = await docsRes.json() as { documents: DocumentSummary[] }
      setDocuments(docsData.documents ?? [])
      if (propsRes.ok) {
        const propsData = await propsRes.json() as { properties: PropertyOption[] }
        setProperties(propsData.properties ?? [])
      }
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-foreground-muted">Loading…</span>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-display text-2xl text-foreground">Uploads</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Every statement you've uploaded, grouped by property and period.</p>
        </div>
        <div className="text-center py-16">
          <p className="text-sm text-foreground-muted">No uploads yet.</p>
          <Link href="/upload" className="text-accent text-sm hover:underline mt-2 inline-block">Upload a statement →</Link>
        </div>
      </div>
    )
  }

  const propertyMap = new Map(properties.map(p => [p.id, p]))
  const groupsByKey = new Map<string, DocumentSummary[]>()
  for (const doc of documents) {
    const key = doc.propertyId ?? 'unassigned'
    groupsByKey.set(key, [...(groupsByKey.get(key) ?? []), doc])
  }

  function labelForKey(key: string): string {
    if (key === 'unassigned') return 'Unassigned'
    const property = propertyMap.get(key)
    return property ? propertyLabel(property) : 'Unknown property'
  }

  const sortedGroups = [...groupsByKey.entries()].sort(([keyA], [keyB]) => {
    if (keyA === 'unassigned') return 1
    if (keyB === 'unassigned') return -1
    return labelForKey(keyA).localeCompare(labelForKey(keyB))
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground">Uploads</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Every statement you've uploaded, grouped by property and period.</p>
      </div>

      <div className="space-y-6">
        {sortedGroups.map(([key, groupDocs]) => {
          const docsInGroup = [...groupDocs].sort((a, b) => {
            const aKey = a.periodStart ?? a.uploadedAt
            const bKey = b.periodStart ?? b.uploadedAt
            return bKey.localeCompare(aKey)
          })
          const overlapping = computeOverlappingIds(docsInGroup)
          const label = labelForKey(key)

          return (
            <div key={key}>
              <h2 className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-2">{label}</h2>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                {docsInGroup.map((doc, i) => (
                  <Link
                    key={doc.id}
                    href={`/uploads/${doc.id}`}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-background transition-colors ${i > 0 ? 'border-t border-rule' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{doc.fileName}</p>
                      <p className="text-xs text-foreground-subtle mt-0.5">
                        {periodLabel(doc)} · Uploaded {formatDateTime(doc.uploadedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {overlapping.has(doc.id) && (
                        <Badge variant="partial">Overlaps another statement</Badge>
                      )}
                      <Badge variant={STATUS_META[doc.status].badgeVariant}>
                        {STATUS_META[doc.status].label}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
