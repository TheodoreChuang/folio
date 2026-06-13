import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { captureError } from '@/lib/api-error'
import { findSourceDocumentById, softDeleteDocumentWithEntries } from '@/lib/ingestion'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    let entriesDeleted = 0
    try {
      const result = await softDeleteDocumentWithEntries(user.id, id)
      entriesDeleted = result.entriesDeleted
    } catch (err) {
      captureError(err, { route: 'DELETE /api/v1/documents/[id]', phase: 'transaction' })
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    // Best-effort storage delete — don't fail the request if this errors
    const supabase = await createServerSupabaseClient()
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([doc.filePath])

    if (storageError) {
      logger.error('storage delete failed', { error: storageError?.message })
    }

    return NextResponse.json({ deleted: true, entriesDeleted })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/documents/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
