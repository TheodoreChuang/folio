import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedger, sourceDocuments } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'

const MONTH_REGEX = /^\d{4}-\d{2}$/

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'Missing month parameter' }, { status: 400 })
    }
    if (!MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (must be YYYY-MM)' }, { status: 400 })
    }

    const startDate = `${month}-01`
    const endDate = lastDayOfMonth(month)

    const docs = await db
      .selectDistinctOn(
        [propertyLedger.propertyId, propertyLedger.sourceDocumentId],
        {
          id: sourceDocuments.id,
          fileName: sourceDocuments.fileName,
          propertyId: propertyLedger.propertyId,
          uploadedAt: sourceDocuments.uploadedAt,
        }
      )
      .from(propertyLedger)
      .innerJoin(sourceDocuments, eq(propertyLedger.sourceDocumentId, sourceDocuments.id))
      .where(
        and(
          eq(propertyLedger.userId, user.id),
          gte(propertyLedger.lineItemDate, startDate),
          lte(propertyLedger.lineItemDate, endDate),
          isNotNull(propertyLedger.sourceDocumentId),
          isNull(propertyLedger.deletedAt),
          isNull(sourceDocuments.deletedAt),
        )
      )

    return NextResponse.json({
      documents: docs.map(d => ({
        id: d.id,
        fileName: d.fileName,
        propertyId: d.propertyId,
        uploadedAt: d.uploadedAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: 'GET /api/documents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
