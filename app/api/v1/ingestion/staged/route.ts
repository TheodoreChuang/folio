import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import {
  listStagedByUser,
  getDocumentsByUser,
  listPreviouslyDeletedForReupload,
} from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [items, docs] = await Promise.all([
      listStagedByUser(user.id),
      getDocumentsByUser(user.id),
    ])

    const docMap = new Map(docs.map(d => [d.id, d]))

    const grouped = new Map<string, { sourceDocumentId: string; documentFileName: string; items: typeof items }>()
    for (const item of items) {
      if (!grouped.has(item.sourceDocumentId)) {
        grouped.set(item.sourceDocumentId, {
          sourceDocumentId: item.sourceDocumentId,
          documentFileName: docMap.get(item.sourceDocumentId)?.fileName ?? 'Unknown',
          items: [],
        })
      }
      grouped.get(item.sourceDocumentId)?.items.push(item)
    }

    // Attach the R18 re-upload warning: transactions the user previously deleted from a
    // prior upload this one supersedes (resolved by Replace link or same-hash void/dismiss).
    const sessions = await Promise.all(
      Array.from(grouped.values()).map(async (session) => {
        const doc = docMap.get(session.sourceDocumentId)
        const previouslyDeleted = doc
          ? await listPreviouslyDeletedForReupload(user.id, doc)
          : []
        return { ...session, previouslyDeleted }
      })
    )

    return NextResponse.json({ sessions })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/ingestion/staged' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
