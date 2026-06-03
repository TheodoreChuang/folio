import { describe, it, expect } from 'vitest'
import { computeIoRollover } from '@/lib/aggregate/plan/calculators/io-rollover'
import { pmt, interestOnlyPayment } from '@/lib/aggregate/plan/calculators/rate-sensitivity'
import type { PlanContextLoan } from '@/lib/aggregate/plan/context'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<PlanContextLoan> = {}): PlanContextLoan {
  return {
    id: 'loan-1',
    lender: 'CBA',
    nickname: null,
    propertyId: 'prop-1',
    loanType: 'interest_only',
    rateType: 'variable',
    interestRate: '6.35',
    ioEndDate: '2027-06-30',
    startDate: '2022-06-30',     // 5 yr IO period
    loanTermYears: 30,
    originalAmountCents: 61500000,
    latestBalance: { balanceCents: 61500000, recordedAt: '2026-01-01' },
    ...overrides,
  }
}

// ── computeIoRollover ─────────────────────────────────────────────────────────

describe('computeIoRollover', () => {
  it('returns rows: [] when no IO loans have an ioEndDate', () => {
    const loans = [makeLoan({ ioEndDate: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(0)
    expect(result.totalAdditionalMonthlyCents).toBe(0)
  })

  it('returns rows: [] when loan is not interest_only type', () => {
    const loans = [makeLoan({ loanType: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(0)
  })

  it('excludes loan with no balance recorded', () => {
    const loans = [makeLoan({ latestBalance: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(0)
  })

  it('excludes loan with no interestRate', () => {
    const loans = [makeLoan({ interestRate: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(0)
  })

  it('IO loan at 5.50%, balance $400k: IO monthly ≈ $1,833', () => {
    const loans = [makeLoan({
      interestRate: '5.50',
      latestBalance: { balanceCents: 40000000, recordedAt: '2026-01-01' },
    })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(1)
    const expected = Math.round(0.055 / 12 * 40000000)
    expect(result.rows[0].ioMonthlyRepaymentCents).toBe(expected)
    // $1,833/mo
    expect(Math.round(expected / 100)).toBe(1833)
  })

  it('P&I rate defaults to ioRate − 0.30%', () => {
    const loans = [makeLoan({ interestRate: '5.50' })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows[0].pAndIRate).toBeCloseTo(5.20, 2)
  })

  it('PMT at default P&I rate is correct: PMT(5.20%, 240mo, $400k)', () => {
    const loans = [makeLoan({
      interestRate: '5.50',
      loanTermYears: 30,
      startDate: '2022-06-30',    // 5 yr IO → 25 yr remaining P&I
      ioEndDate: '2027-06-30',
      latestBalance: { balanceCents: 40000000, recordedAt: '2026-01-01' },
    })]
    const result = computeIoRollover(loans, {}, null)
    const row = result.rows[0]
    // 25 yr remaining = 300 months
    const expected = pmt(5.20, 300, 40000000)
    expect(row.pAndIMonthlyRepaymentCents).toBe(expected)
  })

  it('editable rate override applies per loan', () => {
    const loans = [makeLoan({ interestRate: '6.35', id: 'loan-x' })]
    const result = computeIoRollover(loans, { 'loan-x': 5.50 }, null)
    expect(result.rows[0].pAndIRate).toBe(5.50)
    const expected = pmt(5.50, Math.round(25 * 12), 61500000)
    expect(result.rows[0].pAndIMonthlyRepaymentCents).toBe(expected)
  })

  it('termUnknown = true when loanTermYears is null', () => {
    const loans = [makeLoan({ loanTermYears: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows[0].termUnknown).toBe(true)
    expect(result.rows[0].pAndIMonthlyRepaymentCents).toBeNull()
    expect(result.rows[0].deltaCents).toBeNull()
  })

  it('termUnknown = true when startDate is null', () => {
    const loans = [makeLoan({ startDate: null })]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows[0].termUnknown).toBe(true)
    expect(result.rows[0].deltaCents).toBeNull()
  })

  it('loan without ioEndDate is excluded from rows', () => {
    const loans = [
      makeLoan({ id: 'a', ioEndDate: '2027-06-30' }),
      makeLoan({ id: 'b', ioEndDate: null }),
    ]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].loanId).toBe('a')
  })

  it('totalAdditionalMonthlyCents = sum of deltas across rows with known terms', () => {
    const loans = [
      makeLoan({ id: 'a', interestRate: '6.35', latestBalance: { balanceCents: 61500000, recordedAt: '2026-01-01' } }),
      makeLoan({ id: 'b', interestRate: '6.10', latestBalance: { balanceCents: 48000000, recordedAt: '2026-01-01' }, ioEndDate: '2028-03-14' }),
    ]
    const result = computeIoRollover(loans, {}, null)
    const expectedTotal = result.rows.reduce((s, r) => s + (r.deltaCents ?? 0), 0)
    expect(result.totalAdditionalMonthlyCents).toBe(expectedTotal)
  })

  it('totalAdditionalAnnualCents = totalAdditionalMonthlyCents * 12', () => {
    const loans = [makeLoan()]
    const result = computeIoRollover(loans, {}, null)
    expect(result.totalAdditionalAnnualCents).toBe(result.totalAdditionalMonthlyCents * 12)
  })

  it('rows are sorted ascending by ioEndDate', () => {
    const loans = [
      makeLoan({ id: 'later', ioEndDate: '2028-03-14' }),
      makeLoan({ id: 'earlier', ioEndDate: '2027-06-30' }),
    ]
    const result = computeIoRollover(loans, {}, null)
    expect(result.rows[0].loanId).toBe('earlier')
    expect(result.rows[1].loanId).toBe('later')
  })

  it('deltaCents = pAndIMonthly - ioMonthly (positive = more expensive)', () => {
    const loans = [makeLoan({ interestRate: '6.35', latestBalance: { balanceCents: 61500000, recordedAt: '2026-01-01' } })]
    const result = computeIoRollover(loans, {}, null)
    const row = result.rows[0]
    expect(row.deltaCents).toBe((row.pAndIMonthlyRepaymentCents ?? 0) - row.ioMonthlyRepaymentCents)
    expect(row.deltaCents).toBeGreaterThan(0)
  })

  it('loans with termUnknown contribute 0 to totalAdditionalMonthlyCents', () => {
    const loans = [
      makeLoan({ id: 'known', loanTermYears: 30 }),
      makeLoan({ id: 'unknown', loanTermYears: null }),
    ]
    const result = computeIoRollover(loans, {}, null)
    const knownRow = result.rows.find(r => r.loanId === 'known')!
    expect(result.totalAdditionalMonthlyCents).toBe(knownRow.deltaCents)
  })

  it('interestOnlyPayment round-trip: 5.50% on $400k', () => {
    const result = interestOnlyPayment(5.50, 40000000)
    expect(result).toBe(Math.round(0.055 / 12 * 40000000))
  })
})
