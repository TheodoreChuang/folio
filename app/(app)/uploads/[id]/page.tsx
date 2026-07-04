'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog'
import type { SourceDocument } from '@/db/schema'

const STATUS_LABELS: Record<SourceDocument['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  voided: 'Voided',
  dismissed: 'Dismissed',
}

const STATUS_STYLES: Record<SourceDocument['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-green-100 text-green-700 border-green-200',
  voided: 'bg-surface-sunken text-foreground-muted border-border',
  dismissed: 'bg-surface-sunken text-foreground-muted border-border',
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function UploadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [document, setDocument] = useState<SourceDocument | null>(null)
  const [activeTransactionCount, setActiveTransactionCount] = useState(0)

  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const loadDocument = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/documents/${id}`)
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) { toast.error('Failed to load upload'); return }
      const data = await res.json() as { document: SourceDocument; activeTransactionCount: number }
      setDocument(data.document)
      setActiveTransactionCount(data.activeTransactionCount)
    } catch {
      toast.error('Failed to load upload')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { loadDocument() }, [loadDocument])

  async function handleVoid() {
    setVoiding(true)
    try {
      const res = await fetch(`/api/v1/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to void upload')
        return
      }
      const data = await res.json() as { outcome: 'voided' | 'dismissed'; entriesDeleted: number }
      toast.success(data.outcome === 'voided' ? 'Upload voided' : 'Upload dismissed')
      setShowVoidModal(false)
      await loadDocument()
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setVoiding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-foreground-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !document) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-foreground-muted">Upload not found.</p>
        <Link href="/upload" className="text-accent text-sm hover:underline mt-2 inline-block">← Back to upload</Link>
      </div>
    )
  }

  const isVoidable = document.status === 'confirmed' || document.status === 'pending'

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-3">
        <Link href="/upload" className="hover:text-foreground transition-colors">Upload</Link>
        <span>›</span>
        <span className="truncate">{document.fileName}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground truncate">{document.fileName}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`inline-flex items-center h-[22px] px-3 rounded-full text-[10px] font-medium uppercase tracking-wide border whitespace-nowrap ${STATUS_STYLES[document.status]}`}>
            {STATUS_LABELS[document.status]}
          </span>
          <span className="text-xs text-foreground-subtle">Uploaded {formatDateTime(document.uploadedAt)}</span>
          {(document.periodStart || document.periodEnd) && (
            <span className="text-xs text-foreground-subtle">
              Period {formatDate(document.periodStart)} – {formatDate(document.periodEnd)}
            </span>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 max-w-md">
        <div className="flex items-center justify-between py-2 border-b border-rule">
          <span className="text-xs font-medium text-foreground-subtle">Linked transactions</span>
          <span className="text-sm font-medium tabular-nums">{activeTransactionCount}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-medium text-foreground-subtle">Status</span>
          <span className="text-sm">{STATUS_LABELS[document.status]}</span>
        </div>

        {isVoidable && (
          <div className="mt-5 pt-5" style={{ borderTop: '1px dashed hsl(var(--color-rule))' }}>
            <Button
              size="sm"
              variant="outline"
              className="text-negative border-negative/30 hover:bg-negative/8"
              onClick={() => setShowVoidModal(true)}
            >
              Void this upload
            </Button>
          </div>
        )}
      </div>

      {/* Void dialog */}
      <Dialog open={showVoidModal} onOpenChange={setShowVoidModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void upload</DialogTitle>
            <DialogDescription>
              {document.fileName} (uploaded {formatDateTime(document.uploadedAt)}) will be voided.
              {activeTransactionCount > 0
                ? ` Its ${activeTransactionCount} linked ${activeTransactionCount === 1 ? 'transaction' : 'transactions'} will be removed.`
                : ' It has no active linked transactions.'
              } This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleVoid}
              disabled={voiding}
            >
              {voiding ? 'Voiding…' : 'Void upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
