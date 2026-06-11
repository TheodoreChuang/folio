import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { findLedgerEntryById, deleteLedgerEntry } from '@/lib/aggregate'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Guard: entries linked to a source document (PDF-extracted) cannot be deleted here.
// Those are removed at the statement level via DELETE /api/documents/[id].
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      // Return 404 to avoid leaking whether the entry exists
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const entry = await findLedgerEntryById(user.id, id)

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (entry.sourceDocumentId !== null) {
      return NextResponse.json(
        { error: 'Cannot delete extracted entries — delete the statement instead' },
        { status: 403 }
      )
    }

    await deleteLedgerEntry(user.id, id)

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/ledger/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
