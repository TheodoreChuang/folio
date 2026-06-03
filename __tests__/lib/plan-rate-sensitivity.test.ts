import { describe, it, expect } from 'vitest'
import {
  computeRateSensitivity,
  pmt,
  interestOnlyPayment,
} from '@/lib/aggregate/plan/calculators/rate-sensitivity'
import type { PlanContextLoan } from '@/lib/aggregate/plan/context'
import type { PlanContext } from '@/lib/aggregate/plan/context'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<PlanContextLoan> = {}): PlanContextLoan {
  return {
    id: 'loan-1',
    lender: 'Westpac',
    nickname: null,
    propertyId: 'prop-1',
    loanType: 'interest_only',
    rateType: 'variable',
    interestRate: '6.00',
    ioEndDate: '2027-01-01',
    startDate: '2022-01-01',
    loanTermYears: 30,
    originalAmountCents: 50000000,
    latestBalance: { balanceCents: 50000000, recordedAt: '2026-01-01' },
    ...overrides,
  }
}

const BASELINE: PlanContext['portfolioBaseline'] = {
  rentMonthlyCents: 300000,
  expensesMonthlyCents: 50000,
  loanRepaymentsMonthlyCents: 200000,
}

// ── pmt formula ───────────────────────────────────────────────────────────────

describe('pmt', () => {
  it('computes monthly P&I payment correctly', () => {
    // PMT(6.5%, 300 months, $600,000) ≈ $4,743/mo
    const result = pmt(6.5, 300, 60000000)
    expect(result).toBeGreaterThan(400000)
    expect(result).toBeLessThan(500000)
    // within $1 of expected (in cents)
    const expected = Math.round((0.065 / 12 * 60000000) / (1 - Math.pow(1 + 0.065 / 12, -300)))
    expect(Math.abs(result - expected)).toBeLessThanOrEqual(1)
  })

  it('returns balance / months when rate is zero', () => {
    expect(pmt(0, 12, 120000)).toBe(10000)
  })
})

// ── interestOnlyPayment ───────────────────────────────────────────────────────

describe('interestOnlyPayment', () => {
  it('IO at 6.35% on $500k = $2,646/mo', () => {
    // $500,000 = 50,000,000 cents
    const result = interestOnlyPayment(6.35, 50000000)
    expect(result).toBe(Math.round(0.0635 / 12 * 50000000))
    expect(result).toBe(264583)
  })

  it('IO at 6.85% on $500k = $2,854/mo', () => {
    const result = interestOnlyPayment(6.85, 50000000)
    expect(result).toBe(Math.round(0.0685 / 12 * 50000000))
    expect(result).toBe(285417)
  })
})

// ── computeRateSensitivity ────────────────────────────────────────────────────

describe('computeRateSensitivity', () => {
  it('returns empty perLoan when no variable loans', () => {
    const loans = [makeLoan({ rateType: 'fixed', loanType: null })]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.excludedCount).toBe(0)
  })

  it('IO loan at 6.35% with $500k balance: today=2646, at +0.5%=2854, delta=+208', () => {
    const loans = [makeLoan({
      id: 'loan-io',
      interestRate: '6.35',
      loanType: 'interest_only',
      rateType: 'variable',
      latestBalance: { balanceCents: 50000000, recordedAt: '2026-01-01' },
    })]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.perLoan).toHaveLength(1)
    const row = result.perLoan[0]
    expect(row.todayRepaymentCents).toBe(Math.round(0.0635 / 12 * 50000000))
    expect(row.deltaRepaymentCents).toBe(Math.round(0.0685 / 12 * 50000000))
    expect(row.changeCents).toBe(row.deltaRepaymentCents - row.todayRepaymentCents)
    // ~$208/mo more (in cents: ~20,833)
    expect(Math.round(row.changeCents / 100)).toBeCloseTo(208, 0)
  })

  it('P&I loan: PMT round-trip within $1', () => {
    const loans = [makeLoan({
      id: 'loan-pni',
      interestRate: '6.5',
      loanType: null,
      rateType: 'variable',
      loanTermYears: 25,
      latestBalance: { balanceCents: 60000000, recordedAt: '2026-01-01' },
    })]
    const result = computeRateSensitivity(loans, 0, null, null)
    const row = result.perLoan[0]
    const expected = Math.round((0.065 / 12 * 60000000) / (1 - Math.pow(1 + 0.065 / 12, -300)))
    expect(Math.abs(row.todayRepaymentCents - expected)).toBeLessThanOrEqual(1)
  })

  it('line_of_credit loan is included and treated as IO', () => {
    const loans = [makeLoan({
      id: 'loan-loc',
      loanType: 'line_of_credit',
      rateType: null,
      interestRate: '7.00',
      latestBalance: { balanceCents: 10000000, recordedAt: '2026-01-01' },
    })]
    const result = computeRateSensitivity(loans, 0, null, null)
    expect(result.perLoan).toHaveLength(1)
    expect(result.perLoan[0].todayRepaymentCents).toBe(Math.round(0.07 / 12 * 10000000))
  })

  it('fixed-rate loan is excluded', () => {
    const loans = [makeLoan({ rateType: 'fixed', loanType: null })]
    const result = computeRateSensitivity(loans, 1, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.excludedCount).toBe(0) // fixed loans are not counted as excluded
  })

  it('loan with no interestRate is excluded and counted', () => {
    const loans = [makeLoan({ interestRate: null })]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.excludedCount).toBe(1)
  })

  it('loan with no balance is excluded and counted', () => {
    const loans = [makeLoan({ latestBalance: null })]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.excludedCount).toBe(1)
  })

  it('P&I loan with null loanTermYears is excluded and counted', () => {
    const loans = [makeLoan({
      loanType: null,
      rateType: 'variable',
      loanTermYears: null,
    })]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.excludedCount).toBe(1)
  })

  it('two variable loans: total today repayments = sum of individuals', () => {
    const loans = [
      makeLoan({ id: 'loan-a', interestRate: '6.00', latestBalance: { balanceCents: 40000000, recordedAt: '2026-01-01' } }),
      makeLoan({ id: 'loan-b', interestRate: '7.00', latestBalance: { balanceCents: 20000000, recordedAt: '2026-01-01' } }),
    ]
    const result = computeRateSensitivity(loans, 0, null, null)
    expect(result.totalTodayRepaymentsCents).toBe(
      result.perLoan[0].todayRepaymentCents + result.perLoan[1].todayRepaymentCents,
    )
  })

  it('portfolioCashflowAtDeltaCents = rent − expenses − totalDeltaRepayments when baseline non-null', () => {
    const loans = [makeLoan({ interestRate: '6.00', latestBalance: { balanceCents: 40000000, recordedAt: '2026-01-01' } })]
    const result = computeRateSensitivity(loans, 1.0, BASELINE, null)
    expect(result.portfolioCashflowAtDeltaCents).toBe(
      BASELINE.rentMonthlyCents - BASELINE.expensesMonthlyCents - result.totalDeltaRepaymentsCents,
    )
  })

  it('portfolioCashflowAtDeltaCents is null when baseline is null', () => {
    const loans = [makeLoan()]
    const result = computeRateSensitivity(loans, 0.5, null, null)
    expect(result.portfolioCashflowTodayCents).toBeNull()
    expect(result.portfolioCashflowAtDeltaCents).toBeNull()
  })

  it('at delta=0, totalChangeCents is 0', () => {
    const loans = [makeLoan({ interestRate: '6.5' })]
    const result = computeRateSensitivity(loans, 0, BASELINE, null)
    expect(result.totalChangeCents).toBe(0)
  })

  it('all-fixed portfolio: empty perLoan, totals zero', () => {
    const loans = [
      makeLoan({ id: 'a', rateType: 'fixed', loanType: null }),
      makeLoan({ id: 'b', rateType: 'fixed', loanType: null }),
    ]
    const result = computeRateSensitivity(loans, 1, null, null)
    expect(result.perLoan).toHaveLength(0)
    expect(result.totalTodayRepaymentsCents).toBe(0)
    expect(result.totalDeltaRepaymentsCents).toBe(0)
    expect(result.totalChangeCents).toBe(0)
  })

  it('portfolioCashflowToday = rent − expenses − totalTodayRepayments (not ledger repayments)', () => {
    // This verifies the "today" cashflow uses computed repayments, not baseline.loanRepaymentsMonthlyCents
    const loans = [makeLoan({ interestRate: '6.00', latestBalance: { balanceCents: 40000000, recordedAt: '2026-01-01' } })]
    const result = computeRateSensitivity(loans, 0, BASELINE, null)
    expect(result.portfolioCashflowTodayCents).toBe(
      BASELINE.rentMonthlyCents - BASELINE.expensesMonthlyCents - result.totalTodayRepaymentsCents,
    )
    // Should NOT equal rent - expenses - ledger repayments (unless they happen to match)
  })
})
