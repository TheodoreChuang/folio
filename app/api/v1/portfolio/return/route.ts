import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { getReturnData, computeReturn } from '@/lib/aggregate'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function calendarMonths(from: string, to: string): number {
  const fromYear = parseInt(from.slice(0, 4))
  const fromMonth = parseInt(from.slice(5, 7))
  const toYear = parseInt(to.slice(0, 4))
  const toMonth = parseInt(to.slice(5, 7))
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1
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

    const entityIdParam = searchParams.get('entityId')
    if (entityIdParam !== null && !UUID_REGEX.test(entityIdParam)) {
      return NextResponse.json({ error: 'entityId must be a valid UUID' }, { status: 400 })
    }

    const periodMonths = calendarMonths(from, to)
    const data = await getReturnData(user.id, from, to, entityIdParam)
    const result = computeReturn({ ...data, periodMonths })

    return NextResponse.json({ return: result })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/portfolio/return' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
