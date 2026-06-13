import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { listTrends, computeTrends } from '@/lib/aggregate'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  const months: string[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)

    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !DATE_REGEX.test(from)) {
      return NextResponse.json({ error: 'from must be a date in YYYY-MM-DD format' }, { status: 400 })
    }
    const fromDate = new Date(from + 'T00:00:00Z')
    if (isNaN(fromDate.getTime()) || fromDate.toISOString().slice(0, 10) !== from) {
      return NextResponse.json({ error: 'from must be a valid date' }, { status: 400 })
    }
    if (!to || !DATE_REGEX.test(to)) {
      return NextResponse.json({ error: 'to must be a date in YYYY-MM-DD format' }, { status: 400 })
    }
    const toDate = new Date(to + 'T00:00:00Z')
    if (isNaN(toDate.getTime()) || toDate.toISOString().slice(0, 10) !== to) {
      return NextResponse.json({ error: 'to must be a valid date' }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must not be after to' }, { status: 400 })
    }

    const months = monthsBetween(from, to)
    if (months.length > 24) {
      return NextResponse.json({ error: 'date range must not exceed 24 months' }, { status: 400 })
    }

    const entityIdParam = searchParams.get('entityId')
    if (entityIdParam !== null && !UUID_REGEX.test(entityIdParam)) {
      return NextResponse.json({ error: 'entityId must be a valid UUID' }, { status: 400 })
    }

    const rows = await listTrends(user.id, from, to, entityIdParam)
    return NextResponse.json({ trends: computeTrends(rows, months) })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/reports/trends' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
