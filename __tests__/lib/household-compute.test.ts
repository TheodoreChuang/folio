import { describe, it, expect } from 'vitest'
import { toMonthlyCents, toAnnualCents, computeSummary } from '@/lib/household/compute'
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

describe('toAnnualCents', () => {
  it('multiplies weekly by 52', () => {
    expect(toAnnualCents(10000, 'weekly')).toBe(520000)
  })

  it('multiplies fortnightly by 26', () => {
    expect(toAnnualCents(10000, 'fortnightly')).toBe(260000)
  })

  it('multiplies monthly by 12', () => {
    expect(toAnnualCents(50000, 'monthly')).toBe(600000)
  })

  it('returns amount unchanged for annual', () => {
    expect(toAnnualCents(55010, 'annual')).toBe(55010)
  })

  it('returns 0 for zero amount regardless of frequency', () => {
    expect(toAnnualCents(0, 'weekly')).toBe(0)
    expect(toAnnualCents(0, 'fortnightly')).toBe(0)
    expect(toAnnualCents(0, 'monthly')).toBe(0)
    expect(toAnnualCents(0, 'annual')).toBe(0)
  })

  it('annual-frequency: avoids double-rounding through monthly (reported bug)', () => {
    // $550.10/yr → monthly rounds to 4584 → 4584×12 = 55008 (wrong via old path)
    // Direct:  55010 × 1 = 55010 (correct)
    expect(toAnnualCents(55010, 'annual')).toBe(55010)
    expect(toMonthlyCents(55010, 'annual') * 12).not.toBe(55010)
  })

  it('weekly-frequency: avoids double-rounding through monthly', () => {
    // 10000 weekly → monthly rounds to 43333 → 43333×12 = 519996 (wrong)
    // Direct: 10000 × 52 = 520000 (correct)
    expect(toAnnualCents(10000, 'weekly')).toBe(520000)
    expect(toMonthlyCents(10000, 'weekly') * 12).not.toBe(520000)
  })

  it('monthly-frequency: monthly×12 equals annual (no rounding in either direction)', () => {
    expect(toMonthlyCents(50000, 'monthly') * 12).toBe(toAnnualCents(50000, 'monthly'))
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
