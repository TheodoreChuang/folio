import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'
import { fetchPropertyTrendData } from '@/lib/reporting'
import { findPropertyById } from '@/lib/property'

export type TrendPoint = {
  month: string
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasData: boolean
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXPENSE_CATEGORIES = new Set([
  'insurance', 'rates', 'repairs', 'property_management',
  'utilities', 'strata_fees', 'other_expense',
])

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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    const rows = await fetchPropertyTrendData(user.id, id, from, to)

    type MonthBucket = { rent: number; expenses: number; mortgage: number }
    const buckets = new Map<string, MonthBucket>()
    for (const row of rows) {
      const b = buckets.get(row.month) ?? { rent: 0, expenses: 0, mortgage: 0 }
      if (row.category === 'rent') {
        b.rent += Number(row.totalCents)
      } else if (EXPENSE_CATEGORIES.has(row.category)) {
        b.expenses += Number(row.totalCents)
      } else if (row.category === 'loan_payment') {
        b.mortgage += Number(row.totalCents)
      }
      buckets.set(row.month, b)
    }

    const trends: TrendPoint[] = months.map(month => {
      const b = buckets.get(month) ?? { rent: 0, expenses: 0, mortgage: 0 }
      const hasData = b.rent > 0 || b.expenses > 0 || b.mortgage > 0
      return {
        month,
        rentCents:     b.rent,
        expensesCents: b.expenses,
        mortgageCents: b.mortgage,
        netCents:      b.rent - b.expenses - b.mortgage,
        hasData,
      }
    })

    const activeMonths = trends.filter(t => t.hasData)
    const avgMonthlyNetCents =
      activeMonths.length > 0
        ? Math.round(activeMonths.reduce((sum, t) => sum + t.netCents, 0) / activeMonths.length)
        : null

    return NextResponse.json({ trends, avgMonthlyNetCents })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]/trends' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
