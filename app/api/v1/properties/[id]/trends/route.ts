import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'
import { listPropertyTrends, computeTrends } from '@/lib/aggregate'
import { findPropertyById } from '@/lib/property'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function generateMonthRange(endMonth: string, count: number): string[] {
  const [year, mon] = endMonth.split('-').map(Number)
  const months: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const monthsRaw = searchParams.get('months') ?? '12'
    const monthsNum = parseInt(monthsRaw, 10)
    if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 24) {
      return NextResponse.json(
        { error: 'months must be an integer between 1 and 24' },
        { status: 400 }
      )
    }

    const property = await findPropertyById(user.id, id)
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const end = currentMonth()
    const months = generateMonthRange(end, monthsNum)
    const from = `${months[0]}-01`
    const to = lastDayOfMonth(months[months.length - 1])

    const rows = await listPropertyTrends(user.id, id, from, to)
    const trends = computeTrends(rows, months)

    const activeMonths = trends.filter(t => t.hasData)
    const avgMonthlyNetCents =
      activeMonths.length > 0
        ? Math.round(activeMonths.reduce((sum, t) => sum + t.netCents, 0) / activeMonths.length)
        : null

    return NextResponse.json({ trends, avgMonthlyNetCents })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/properties/[id]/trends' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
