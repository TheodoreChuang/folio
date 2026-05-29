import { describe, it, expect } from 'vitest'
import { toMonthlyCents, computeSummary } from '@/lib/household/compute'
import type { PersonalBudgetItem } from '@/db/schema'

function makeItem(overrides: Partial<PersonalBudgetItem> = {}): PersonalBudgetItem {
  return {
    id: 'test-id',
    userId: 'user-1',
    type: 'income',
    name: 'Salary',
    amountCents: 100000,
    frequency: 'monthly',
    effectiveFrom: '2024-01-01',
    detail: null,
    category: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('toMonthlyCents', () => {
  it('converts weekly to monthly', () => {
    expect(toMonthlyCents(10000, 'weekly')).toBe(Math.round(10000 * 52 / 12))
  })

  it('converts fortnightly to monthly', () => {
    expect(toMonthlyCents(326900, 'fortnightly')).toBe(Math.round(326900 * 26 / 12))
  })

  it('returns amount unchanged for monthly', () => {
    expect(toMonthlyCents(50000, 'monthly')).toBe(50000)
  })

  it('converts annual to monthly', () => {
    expect(toMonthlyCents(120000, 'annual')).toBe(10000)
  })

  it('returns 0 for zero amount regardless of frequency', () => {
    expect(toMonthlyCents(0, 'weekly')).toBe(0)
    expect(toMonthlyCents(0, 'fortnightly')).toBe(0)
    expect(toMonthlyCents(0, 'monthly')).toBe(0)
    expect(toMonthlyCents(0, 'annual')).toBe(0)
  })
})

describe('computeSummary', () => {
  it('returns all zeros for empty items', () => {
    expect(computeSummary([])).toEqual({
      totalIncomeMonthlyCents: 0,
      totalExpensesMonthlyCents: 0,
      surplusMonthlyCents: 0,
    })
  })

  it('sums only income when no expenses', () => {
    const items = [
      makeItem({ type: 'income', amountCents: 100000, frequency: 'monthly' }),
      makeItem({ type: 'income', amountCents: 50000, frequency: 'monthly' }),
    ]
    expect(computeSummary(items)).toEqual({
      totalIncomeMonthlyCents: 150000,
      totalExpensesMonthlyCents: 0,
      surplusMonthlyCents: 150000,
    })
  })

  it('sums only expenses when no income, surplus is negative', () => {
    const items = [
      makeItem({ type: 'expense', amountCents: 80000, frequency: 'monthly' }),
    ]
    expect(computeSummary(items)).toEqual({
      totalIncomeMonthlyCents: 0,
      totalExpensesMonthlyCents: 80000,
      surplusMonthlyCents: -80000,
    })
  })

  it('computes surplus from mixed items', () => {
    const items = [
      makeItem({ type: 'income', amountCents: 150000, frequency: 'monthly' }),
      makeItem({ type: 'expense', amountCents: 80000, frequency: 'monthly' }),
    ]
    expect(computeSummary(items)).toEqual({
      totalIncomeMonthlyCents: 150000,
      totalExpensesMonthlyCents: 80000,
      surplusMonthlyCents: 70000,
    })
  })
})
