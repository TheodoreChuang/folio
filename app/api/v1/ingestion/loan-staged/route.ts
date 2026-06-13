import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { listLoanStagedByUser, getDocumentsByUser, groupStagedItemsByDocument } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [items, docs] = await Promise.all([
      listLoanStagedByUser(user.id),
      getDocumentsByUser(user.id),
    ])

    const docMap = new Map(docs.map(d => [d.id, d.fileName]))
    const sessions = groupStagedItemsByDocument(items, docMap)
    return NextResponse.json({ sessions })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/ingestion/loan-staged' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
