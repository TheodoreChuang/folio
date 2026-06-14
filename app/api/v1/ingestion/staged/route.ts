import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { listStagedByUser, getDocumentsByUser } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [items, docs] = await Promise.all([
      listStagedByUser(user.id),
      getDocumentsByUser(user.id),
    ])

    const docMap = new Map(docs.map(d => [d.id, d.fileName]))

    const grouped = new Map<string, { sourceDocumentId: string; documentFileName: string; items: typeof items }>()
    for (const item of items) {
      if (!grouped.has(item.sourceDocumentId)) {
        grouped.set(item.sourceDocumentId, {
          sourceDocumentId: item.sourceDocumentId,
          documentFileName: docMap.get(item.sourceDocumentId) ?? 'Unknown',
          items: [],
        })
      }
      grouped.get(item.sourceDocumentId)?.items.push(item)
    }

    const sessions = Array.from(grouped.values())
    return NextResponse.json({ sessions })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/ingestion/staged' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
