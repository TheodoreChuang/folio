import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'
import { listDocumentsForDateRange } from '@/lib/ingestion'

const MONTH_REGEX = /^\d{4}-\d{2}$/

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
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

    const docs = await listDocumentsForDateRange(user.id, startDate, endDate)

    return NextResponse.json({ documents: docs })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/documents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
