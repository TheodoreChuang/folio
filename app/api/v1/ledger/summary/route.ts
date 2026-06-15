import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { getCashflowSummary } from '@/lib/aggregate'
import { LedgerSummaryResponseSchema } from '@/lib/openapi'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const propertyId = searchParams.get('propertyId') ?? undefined
    const entityId = searchParams.get('entityId') ?? undefined

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing required params: from and to (YYYY-MM-DD)' }, { status: 400 })
    }

    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) {
      return NextResponse.json({ error: 'Invalid date format — use YYYY-MM-DD' }, { status: 400 })
    }

    if (from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
    }

    const { totals, flags } = await getCashflowSummary(user.id, from, to, { propertyId, entityId })

    return NextResponse.json(LedgerSummaryResponseSchema.parse({ totals, flags }))
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/ledger/summary' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
