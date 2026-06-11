import type { TrendRow } from '@/lib/aggregate/repositories/trends'
import { CATEGORY_BUCKET } from './compute'

export type TrendPoint = {
  month: string
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasData: boolean
}

export function computeTrends(rows: TrendRow[], months: string[]): TrendPoint[] {
  type Bucket = { rent: number; expenses: number; mortgage: number }
  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    const b = buckets.get(row.month) ?? { rent: 0, expenses: 0, mortgage: 0 }
    const bucket = CATEGORY_BUCKET[row.category]
    if (bucket === 'rent') b.rent += Number(row.totalCents)
    else if (bucket === 'expense') b.expenses += Number(row.totalCents)
    else b.mortgage += Number(row.totalCents)
    buckets.set(row.month, b)
  }
  return months.map(month => {
    const b = buckets.get(month) ?? { rent: 0, expenses: 0, mortgage: 0 }
    return {
      month,
      rentCents:     b.rent,
      expensesCents: b.expenses,
      mortgageCents: b.mortgage,
      netCents:      b.rent - b.expenses - b.mortgage,
      hasData:       b.rent > 0 || b.expenses > 0 || b.mortgage > 0,
    }
  })
}
