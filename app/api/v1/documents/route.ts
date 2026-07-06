import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'
import { listDocumentsForDateRange, listDocumentsForProperty } from '@/lib/ingestion'

const MONTH_REGEX = /^\d{4}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const propertyId = searchParams.get('propertyId')

    if (propertyId !== null && !UUID_REGEX.test(propertyId)) {
      return NextResponse.json({ error: 'Invalid propertyId (must be a valid UUID)' }, { status: 400 })
    }

    // R24: with no month, list the caller's full upload history (including
    // voided/dismissed) rather than requiring a date range.
    if (!month) {
      const docs = await listDocumentsForProperty(user.id, propertyId ?? undefined)
      return NextResponse.json({ documents: docs })
    }
    if (!MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (must be YYYY-MM)' }, { status: 400 })
    }

    const startDate = `${month}-01`
    const endDate = lastDayOfMonth(month)

    const docs = await listDocumentsForDateRange(user.id, startDate, endDate)
    // propertyId narrows this branch too — the spec documents it as applying
    // whenever supplied, not only when month is omitted.
    const filtered = propertyId ? docs.filter(d => d.propertyId === propertyId) : docs

    return NextResponse.json({ documents: filtered })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/documents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
