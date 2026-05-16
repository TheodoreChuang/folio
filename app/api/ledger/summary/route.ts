import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import {
  fetchPropertiesActiveInRange,
  fetchLoansActiveInRange,
  fetchLedgerEntriesInRange,
  computeReport,
} from '@/lib/reporting'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const propertyId = searchParams.get('propertyId')
    const entityId = searchParams.get('entityId')

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

    const [props, loans] = await Promise.all([
      fetchPropertiesActiveInRange(user.id, from, to, propertyId, entityId),
      fetchLoansActiveInRange(user.id, from, to, entityId),
    ])

    const filteredPropertyIds = props.map(p => p.id)
    const hasFilter = !!(propertyId || entityId)
    const entries = await fetchLedgerEntriesInRange(
      user.id,
      from,
      to,
      filteredPropertyIds.length > 0 ? filteredPropertyIds : (hasFilter ? [] : undefined),
    )

    const { totals, flags } = computeReport(entries, props, loans)

    return NextResponse.json({ totals, flags })
  } catch (err) {
    captureError(err, { route: 'GET /api/ledger/summary' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
