import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listLoanStagedByUser, getDocumentsByUser, groupStagedItemsByDocument } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [items, docs] = await Promise.all([
      listLoanStagedByUser(user.id),
      getDocumentsByUser(user.id),
    ])

    const docMap = new Map(docs.map(d => [d.id, d.fileName]))
    const sessions = groupStagedItemsByDocument(items, docMap)
    return NextResponse.json({ sessions })
  } catch (err) {
    captureError(err, { route: 'GET /api/ingestion/loan-staged' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
