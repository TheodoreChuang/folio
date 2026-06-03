import { describe, it, expect } from 'vitest'
import { computeHoldReinvest } from '@/lib/aggregate/plan/calculators/hold-reinvest'
import type { HoldReinvestInput } from '@/lib/aggregate/plan/calculators/hold-reinvest'
import type { PlanContextLoan } from '@/lib/aggregate/plan/context'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<PlanContextLoan> = {}): PlanContextLoan {
  return {
    id: 'loan-1',
    lender: 'CBA',
    nickname: null,
    propertyId: 'prop-1',
    loanType: 'principal_and_interest',
    rateType: 'variable',
    interestRate: '6.00',
    ioEndDate: null,
    startDate: '2020-01-01',
    loanTermYears: 30,
    originalAmountCents: 50_000_000,
    latestBalance: { balanceCents: 50_000_000, recordedAt: '2026-01-01' },
    ...overrides,
  }
}

// Plan test scenario: Sale $850k, commission 2.2%, loan $500k, CGT $40k, buying $23k
function baseInput(overrides: Partial<HoldReinvestInput> = {}): HoldReinvestInput {
  return {
    selectedPropertyId: 'prop-1',
    salePriceCents: 85_000_000,
    cgtCents: 4_000_000,
    newLoanRatePct: 6.0,
    newLoanTermYears: 30,
    newLoanType: 'principal_and_interest',
    lmiAmountCents: 0,
    holdGrowthRatePct: 5.0,
    reinvestGrowthRatePct: 7.0,
    horizonYears: 10,
    sellingCosts: {
      commissionPct: 2.2,
      legalCents: 0,
      marketingCents: 0,
      otherCents: 0,
    },
    buyingCosts: {
      stampDutyCents: 2_000_000,
      legalCents: 300_000,
      buildingPestCents: 0,
      otherCents: 0,
    },
    properties: [],
    loans: [makeLoan()],
    ...overrides,
  }
}

// ── computeHoldReinvest ───────────────────────────────────────────────────────

describe('computeHoldReinvest', () => {
  // ── Core plan scenario ────────────────────────────────────────────────────

  it('sale summary: gross proceeds = salePrice − sellingCosts', () => {
    const result = computeHoldReinvest(baseInput())
    const commissionCents = Math.round(85_000_000 * 2.2 / 100)
    expect(result.saleSummary.sellingCostsCents).toBe(commissionCents)
    expect(result.saleSummary.grossProceedsCents).toBe(85_000_000 - commissionCents)
  })

  it('sale summary: net after loans deducts the outstanding balance', () => {
    const result = computeHoldReinvest(baseInput())
    const commissionCents = Math.round(85_000_000 * 2.2 / 100)
    expect(result.saleSummary.loanPayoutsCents).toBe(50_000_000)
    expect(result.saleSummary.netAfterLoansCents).toBe(85_000_000 - commissionCents - 50_000_000)
  })

  it('sale summary: net after CGT deducts the cgtCents', () => {
    const result = computeHoldReinvest(baseInput())
    const commissionCents = Math.round(85_000_000 * 2.2 / 100)
    const netAfterLoans = 85_000_000 - commissionCents - 50_000_000
    expect(result.saleSummary.netAfterCgtCents).toBe(netAfterLoans - 4_000_000)
  })

  it('reinvest summary: new loan ≈ $581.7k when commission 2.2%, loan $500k, CGT $40k, buying $23k', () => {
    // Plan scenario verification
    const result = computeHoldReinvest(baseInput())
    expect(result.reinvestSummary.newLoanCents).toBe(58_170_000)
  })

  it('reinvest summary: LVR ≈ 68.4% → showLmi = false', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.reinvestSummary.lvrRatio).toBeCloseTo(0.684, 2)
    expect(result.showLmi).toBe(false)
  })

  it('reinvest summary: purchasePrice = salePrice (equal-value baseline)', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.reinvestSummary.purchasePriceCents).toBe(85_000_000)
  })

  it('reinvest summary: netDepositCents = netAfterCgt − buyingCosts', () => {
    const result = computeHoldReinvest(baseInput())
    const { netAfterCgtCents } = result.saleSummary
    expect(result.reinvestSummary.netDepositCents).toBe(netAfterCgtCents - 2_300_000)
  })

  // ── LMI ───────────────────────────────────────────────────────────────────

  it('showLmi = true when LVR > 80%', () => {
    // Reduce sale price so that loan payouts + costs force LVR above 80%
    const result = computeHoldReinvest(baseInput({
      salePriceCents: 50_000_000,
      loans: [makeLoan({ latestBalance: { balanceCents: 40_000_000, recordedAt: '2026-01-01' } })],
      sellingCosts: { commissionPct: 2.0, legalCents: 0, marketingCents: 0, otherCents: 0 },
      cgtCents: 0,
      buyingCosts: { stampDutyCents: 200_000, legalCents: 0, buildingPestCents: 0, otherCents: 0 },
    }))
    expect(result.reinvestSummary.lvrRatio).toBeGreaterThan(0.8)
    expect(result.showLmi).toBe(true)
  })

  it('lmiAmountCents added to effectiveNewLoan when LMI required', () => {
    const result = computeHoldReinvest(baseInput({
      salePriceCents: 50_000_000,
      lmiAmountCents: 1_500_000,
      loans: [makeLoan({ latestBalance: { balanceCents: 40_000_000, recordedAt: '2026-01-01' } })],
      sellingCosts: { commissionPct: 2.0, legalCents: 0, marketingCents: 0, otherCents: 0 },
      cgtCents: 0,
      buyingCosts: { stampDutyCents: 200_000, legalCents: 0, buildingPestCents: 0, otherCents: 0 },
    }))
    expect(result.reinvestSummary.effectiveNewLoanCents).toBe(
      result.reinvestSummary.newLoanCents + 1_500_000,
    )
  })

  it('lmiAmountCents not added when LVR ≤ 80%', () => {
    const result = computeHoldReinvest(baseInput({ lmiAmountCents: 2_000_000 }))
    // LVR 68.4% — LMI not triggered
    expect(result.showLmi).toBe(false)
    expect(result.reinvestSummary.effectiveNewLoanCents).toBe(result.reinvestSummary.newLoanCents)
  })

  // ── Friction ──────────────────────────────────────────────────────────────

  it('frictionCents = sellingCosts + CGT + buyingCosts (no LMI)', () => {
    const result = computeHoldReinvest(baseInput())
    const commissionCents = Math.round(85_000_000 * 2.2 / 100)
    const expected = commissionCents + 4_000_000 + 2_300_000
    expect(result.frictionCents).toBe(expected)
  })

  it('frictionCents equals effectiveNewLoan − outstandingLoans', () => {
    const result = computeHoldReinvest(baseInput())
    const gap = result.reinvestSummary.effectiveNewLoanCents - result.saleSummary.loanPayoutsCents
    expect(result.frictionCents).toBe(gap)
  })

  it('frictionPct = frictionCents / salePrice * 100', () => {
    const result = computeHoldReinvest(baseInput())
    const expected = (result.frictionCents / 85_000_000) * 100
    expect(result.frictionPct).toBeCloseTo(expected, 5)
  })

  // ── Blocked state ─────────────────────────────────────────────────────────

  it('blocked = true when netDeposit ≤ 0', () => {
    const result = computeHoldReinvest(baseInput({
      salePriceCents: 50_000_000,
      loans: [makeLoan({ latestBalance: { balanceCents: 45_000_000, recordedAt: '2026-01-01' } })],
      cgtCents: 1_000_000,
      buyingCosts: { stampDutyCents: 3_000_000, legalCents: 0, buildingPestCents: 0, otherCents: 0 },
    }))
    expect(result.blocked).toBe(true)
    expect(result.blockedReason).not.toBeNull()
  })

  it('blocked = false and blockedReason = null when netDeposit > 0', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.blocked).toBe(false)
    expect(result.blockedReason).toBeNull()
  })

  it('breakEvenYear = null when blocked', () => {
    const result = computeHoldReinvest(baseInput({
      salePriceCents: 50_000_000,
      loans: [makeLoan({ latestBalance: { balanceCents: 55_000_000, recordedAt: '2026-01-01' } })],
      cgtCents: 0,
      buyingCosts: { stampDutyCents: 0, legalCents: 0, buildingPestCents: 0, otherCents: 0 },
    }))
    expect(result.blocked).toBe(true)
    expect(result.breakEvenYear).toBeNull()
  })

  // ── Trajectories ──────────────────────────────────────────────────────────

  it('trajectories have horizonYears + 1 entries', () => {
    const result = computeHoldReinvest(baseInput({ horizonYears: 10 }))
    expect(result.trajectories.holdEquityByYear).toHaveLength(11)
    expect(result.trajectories.reinvestEquityByYear).toHaveLength(11)
  })

  it('holdEquityByYear[0] = salePrice − loanPayouts (no growth at year 0)', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.trajectories.holdEquityByYear[0]).toBe(85_000_000 - 50_000_000)
  })

  it('reinvestEquityByYear[0] = purchasePrice − effectiveNewLoan', () => {
    const result = computeHoldReinvest(baseInput())
    const { purchasePriceCents, effectiveNewLoanCents } = result.reinvestSummary
    expect(result.trajectories.reinvestEquityByYear[0]).toBe(
      purchasePriceCents - effectiveNewLoanCents,
    )
  })

  it('holdEquityByYear[5] ≈ $850k × 1.05^5 − $500k', () => {
    const result = computeHoldReinvest(baseInput())
    const expected = Math.round(85_000_000 * Math.pow(1.05, 5) - 50_000_000)
    expect(result.trajectories.holdEquityByYear[5]).toBe(expected)
  })

  it('reinvestEquityByYear[5] ≈ $850k × 1.07^5 − $581.7k', () => {
    const result = computeHoldReinvest(baseInput())
    const expected = Math.round(85_000_000 * Math.pow(1.07, 5) - 58_170_000)
    expect(result.trajectories.reinvestEquityByYear[5]).toBe(expected)
  })

  it('reinvestEquityByYear[5] > holdEquityByYear[5] at 7% vs 5% growth', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.trajectories.reinvestEquityByYear[5]).toBeGreaterThan(
      result.trajectories.holdEquityByYear[5],
    )
  })

  // ── Break-even ────────────────────────────────────────────────────────────

  it('breakEvenYear = 5 for plan scenario (5% hold vs 7% reinvest)', () => {
    const result = computeHoldReinvest(baseInput())
    expect(result.breakEvenYear).toBe(5)
  })

  it('breakEvenYear = null when reinvestGrowthRatePct ≤ holdGrowthRatePct', () => {
    // Equal growth rates: reinvest always behind (starts with more debt)
    const result = computeHoldReinvest(baseInput({
      holdGrowthRatePct: 5.0,
      reinvestGrowthRatePct: 5.0,
    }))
    expect(result.breakEvenYear).toBeNull()
  })

  it('breakEvenYear = null when reinvestGrowth < holdGrowth', () => {
    const result = computeHoldReinvest(baseInput({
      holdGrowthRatePct: 7.0,
      reinvestGrowthRatePct: 5.0,
    }))
    expect(result.breakEvenYear).toBeNull()
  })

  it('breakEvenYear is the first year where reinvest > hold', () => {
    const result = computeHoldReinvest(baseInput())
    const { holdEquityByYear, reinvestEquityByYear } = result.trajectories
    const year = result.breakEvenYear!
    expect(year).not.toBeNull()
    // Year before break-even: hold >= reinvest
    expect(holdEquityByYear[year - 1]).toBeGreaterThanOrEqual(reinvestEquityByYear[year - 1])
    // Break-even year: reinvest > hold
    expect(reinvestEquityByYear[year]).toBeGreaterThan(holdEquityByYear[year])
  })

  // ── Loan filtering ────────────────────────────────────────────────────────

  it('only sums loans secured against selectedPropertyId', () => {
    const loans = [
      makeLoan({ id: 'a', propertyId: 'prop-1', latestBalance: { balanceCents: 30_000_000, recordedAt: '2026-01-01' } }),
      makeLoan({ id: 'b', propertyId: 'prop-2', latestBalance: { balanceCents: 20_000_000, recordedAt: '2026-01-01' } }),
    ]
    const result = computeHoldReinvest(baseInput({ loans }))
    expect(result.saleSummary.loanPayoutsCents).toBe(30_000_000)
  })

  it('loans with no balance are excluded from payouts', () => {
    const loans = [
      makeLoan({ id: 'a', latestBalance: { balanceCents: 30_000_000, recordedAt: '2026-01-01' } }),
      makeLoan({ id: 'b', latestBalance: null }),
    ]
    const result = computeHoldReinvest(baseInput({ loans }))
    expect(result.saleSummary.loanPayoutsCents).toBe(30_000_000)
  })

  it('loanPayouts = 0 when no loans for the selected property', () => {
    const result = computeHoldReinvest(baseInput({ loans: [] }))
    expect(result.saleSummary.loanPayoutsCents).toBe(0)
  })

  // ── Selling cost components ───────────────────────────────────────────────

  it('all selling cost components are summed into sellingCostsCents', () => {
    const result = computeHoldReinvest(baseInput({
      sellingCosts: {
        commissionPct: 2.0,
        legalCents: 150_000,
        marketingCents: 50_000,
        otherCents: 25_000,
      },
    }))
    const commission = Math.round(85_000_000 * 2.0 / 100)
    expect(result.saleSummary.sellingCostsCents).toBe(commission + 150_000 + 50_000 + 25_000)
  })
})
