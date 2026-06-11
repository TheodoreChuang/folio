import { describe, it, expect } from 'vitest'
import { computeTrends } from '@/lib/aggregate/services/trends'
import type { TrendRow } from '@/lib/aggregate/repositories/trends'

function row(month: string, category: string, totalCents: number): TrendRow {
  return { month, category: category as TrendRow['category'], totalCents }
}

const MONTHS = ['2026-01', '2026-02', '2026-03']

describe('computeTrends', () => {
  it('returns zero-filled TrendPoints for months with no rows', () => {
    const result = computeTrends([], MONTHS)
    expect(result).toHaveLength(3)
    result.forEach(point => {
      expect(point.rentCents).toBe(0)
      expect(point.expensesCents).toBe(0)
      expect(point.mortgageCents).toBe(0)
      expect(point.netCents).toBe(0)
      expect(point.hasData).toBe(false)
    })
  })

  it('routes rent to rentCents', () => {
    const result = computeTrends([row('2026-01', 'rent', 200000)], ['2026-01'])
    expect(result[0].rentCents).toBe(200000)
    expect(result[0].expensesCents).toBe(0)
    expect(result[0].mortgageCents).toBe(0)
  })

  it('routes loan_payment to mortgageCents', () => {
    const result = computeTrends([row('2026-01', 'loan_payment', 150000)], ['2026-01'])
    expect(result[0].mortgageCents).toBe(150000)
    expect(result[0].rentCents).toBe(0)
    expect(result[0].expensesCents).toBe(0)
  })

  it.each([
    'insurance', 'rates', 'repairs', 'property_management',
    'utilities', 'strata_fees', 'other_expense',
  ])('routes %s to expensesCents', (category) => {
    const result = computeTrends([row('2026-01', category, 10000)], ['2026-01'])
    expect(result[0].expensesCents).toBe(10000)
    expect(result[0].rentCents).toBe(0)
    expect(result[0].mortgageCents).toBe(0)
  })

  it('sums multiple expense categories in the same month', () => {
    const rows = [
      row('2026-01', 'insurance', 10000),
      row('2026-01', 'rates', 5000),
      row('2026-01', 'repairs', 20000),
    ]
    const result = computeTrends(rows, ['2026-01'])
    expect(result[0].expensesCents).toBe(35000)
  })

  it('sums multiple rows of the same category in the same month', () => {
    const rows = [
      row('2026-01', 'rent', 100000),
      row('2026-01', 'rent', 50000),
    ]
    const result = computeTrends(rows, ['2026-01'])
    expect(result[0].rentCents).toBe(150000)
  })

  it('derives netCents = rent - expenses - mortgage', () => {
    const rows = [
      row('2026-01', 'rent', 400000),
      row('2026-01', 'repairs', 90000),
      row('2026-01', 'loan_payment', 210000),
    ]
    const result = computeTrends(rows, ['2026-01'])
    expect(result[0].netCents).toBe(400000 - 90000 - 210000)
  })

  it('hasData is true when any bucket has a value', () => {
    const result = computeTrends([row('2026-01', 'rent', 1)], ['2026-01'])
    expect(result[0].hasData).toBe(true)
  })

  it('hasData is false when all buckets are zero', () => {
    const result = computeTrends([], ['2026-01'])
    expect(result[0].hasData).toBe(false)
  })

  it('places rows into their correct month, leaving other months zero', () => {
    const rows = [
      row('2026-01', 'rent', 300000),
      row('2026-03', 'rent', 400000),
    ]
    const result = computeTrends(rows, MONTHS)
    expect(result[0].rentCents).toBe(300000)
    expect(result[1].rentCents).toBe(0)
    expect(result[2].rentCents).toBe(400000)
  })

  it('preserves the month strings from the months array', () => {
    const result = computeTrends([], MONTHS)
    expect(result.map(p => p.month)).toEqual(MONTHS)
  })
})
