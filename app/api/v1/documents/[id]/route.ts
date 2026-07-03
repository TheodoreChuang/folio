import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { captureError } from '@/lib/api-error'
import {
  findSourceDocumentById,
  softDeleteDocumentWithEntries,
  dismissPendingDocument,
  countActiveLinkedTransactions,
} from '@/lib/ingestion'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    const doc = await findSourceDocumentById(user.id, id)
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const activeTransactionCount = await countActiveLinkedTransactions(user.id, id)

    return NextResponse.json({ document: doc, activeTransactionCount })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/documents/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    const doc = await findSourceDocumentById(user.id, id)
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Status-aware transition (KTD-7): a confirmed upload is voided (its ledger rows are
    // soft-deleted with reason='voided'); anything else (pending) is dismissed (its staging
    // is cleared). Both set deletedAt so the file becomes re-uploadable via the partial
    // hash index (R14).
    let outcome: 'voided' | 'dismissed'
    let entriesDeleted = 0
    try {
      if (doc.status === 'confirmed') {
        const result = await softDeleteDocumentWithEntries(user.id, id)
        entriesDeleted = result.entriesDeleted
        outcome = 'voided'
      } else {
        await dismissPendingDocument(user.id, id)
        outcome = 'dismissed'
      }
    } catch (err) {
      captureError(err, { route: 'DELETE /api/v1/documents/[id]', phase: 'transaction' })
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    // Best-effort storage delete — don't fail the request if this errors. A stale object
    // is tolerated by the upload route's upsert-on-409 retry (KTD-3).
    const supabase = await createServerSupabaseClient()
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([doc.filePath])

    if (storageError) {
      logger.error('storage delete failed', { error: storageError?.message })
    }

    return NextResponse.json({ deleted: true, outcome, entriesDeleted })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/documents/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
