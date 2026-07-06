'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'
import { STATUS_META, formatDateTime } from '../status'
import type { SourceDocument } from '@/db/schema'

// The GET route serializes uploadedAt as JSON, so it arrives as a string, not a Date.
type UploadDocument = Omit<SourceDocument, 'uploadedAt'> & { uploadedAt: string }

export default function UploadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [document, setDocument] = useState<UploadDocument | null>(null)
  const [activeTransactionCount, setActiveTransactionCount] = useState(0)

  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const [replacing, setReplacing] = useState(false)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)

  const loadDocument = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/documents/${id}`)
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) { toast.error('Failed to load upload'); return }
      const data = await res.json() as { document: UploadDocument; activeTransactionCount: number }
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
      // The GET route excludes soft-deleted documents, so refetching here would 404
      // on the document we just voided. Reflect the outcome locally instead.
      setDocument(prev => prev ? { ...prev, status: data.outcome } : prev)
      setActiveTransactionCount(0)
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setVoiding(false)
    }
  }

  async function handleReplaceFile(file: File) {
    if (!(file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
      toast.error('Only PDF files are supported')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} is too large (max 1 MB)`)
      return
    }
    setReplacing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('replacesSourceDocumentId', id)
      const uploadRes = await fetch('/api/v1/upload', { method: 'POST', body: formData })
      if (uploadRes.status === 409) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'This file has already been uploaded.')
        return
      }
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Upload failed')
        return
      }
      const { sourceDocumentId } = await uploadRes.json() as { sourceDocumentId: string }
      const extractRes = await fetch('/api/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId }),
      })
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Extraction of the replacement failed')
        return
      }
      // R23: only void the original once the replacement has successfully staged —
      // a cancelled file picker or a rejected upload/extraction leaves the original
      // confirmed and untouched rather than stranding it voided with no replacement.
      const voidRes = await fetch(`/api/v1/documents/${id}`, { method: 'DELETE' })
      if (!voidRes.ok) {
        toast.error('Replacement staged, but the original could not be voided automatically — void it manually below.')
        return
      }
      toast.success('Replacement staged — review and confirm it on the upload page.')
      router.push('/upload')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setReplacing(false)
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
  const isReplaceable = document.status === 'confirmed'

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-3">
        <Link href="/uploads" className="hover:text-foreground transition-colors">Uploads</Link>
        <span>›</span>
        <span className="truncate">{document.fileName}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground truncate">{document.fileName}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant={STATUS_META[document.status].badgeVariant}>
            {STATUS_META[document.status].label}
          </Badge>
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
          <span className="text-sm">{STATUS_META[document.status].label}</span>
        </div>

        {(isReplaceable || isVoidable) && (
          <div className="mt-5 pt-5 space-y-4" style={{ borderTop: '1px dashed hsl(var(--color-rule))' }}>
            {isReplaceable && (
              <div>
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleReplaceFile(file)
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => replaceFileInputRef.current?.click()}
                  disabled={replacing}
                >
                  {replacing ? 'Replacing…' : 'Replace with corrected version'}
                </Button>
                <p className="text-[10px] leading-snug text-foreground-muted mt-1.5">
                  For a single wrong value, correct it from the property page instead of replacing the whole statement.
                </p>
              </div>
            )}
            {isVoidable && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-negative border-negative/30 hover:bg-negative/8"
                  onClick={() => setShowVoidModal(true)}
                  disabled={replacing}
                >
                  Void this upload
                </Button>
              </div>
            )}
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
