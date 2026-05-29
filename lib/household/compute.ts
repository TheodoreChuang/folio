import type { BudgetItemFrequency, PersonalBudgetItem } from '@/db/schema'

export const MONTHLY_FACTOR: Record<BudgetItemFrequency, number> = {
  weekly:      52 / 12,
  fortnightly: 26 / 12,
  monthly:     1,
  annual:      1 / 12,
}

export const ANNUAL_FACTOR: Record<BudgetItemFrequency, number> = {
  weekly:      52,
  fortnightly: 26,
  monthly:     12,
  annual:      1,
}

export function toMonthlyCents(amountCents: number, frequency: BudgetItemFrequency): number {
  return Math.round(amountCents * MONTHLY_FACTOR[frequency])
}

// Compute annual directly from source to avoid double-rounding through toMonthlyCents.
// e.g. $550.10/yr → monthly rounds to $45.84, and $45.84×12 = $550.08 (wrong).
// Computing directly: $550.10 × 1 = $550.10 (correct).
export function toAnnualCents(amountCents: number, frequency: BudgetItemFrequency): number {
  return Math.round(amountCents * ANNUAL_FACTOR[frequency])
}

export function computeSummary(items: PersonalBudgetItem[]): {
  totalIncomeMonthlyCents: number
  totalExpensesMonthlyCents: number
  surplusMonthlyCents: number
} {
  let totalIncomeMonthlyCents = 0
  let totalExpensesMonthlyCents = 0

  for (const item of items) {
    const monthly = toMonthlyCents(item.amountCents, item.frequency)
    if (item.type === 'income') {
      totalIncomeMonthlyCents += monthly
    } else {
      totalExpensesMonthlyCents += monthly
    }
  }

  return {
    totalIncomeMonthlyCents,
    totalExpensesMonthlyCents,
    surplusMonthlyCents: totalIncomeMonthlyCents - totalExpensesMonthlyCents,
  }
}
