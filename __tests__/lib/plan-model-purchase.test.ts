import { describe, it, expect } from 'vitest'
import { computeModelPurchase } from '@/lib/aggregate/plan/calculators/model-purchase'
import type {
  ModelPurchaseInput,
  PurchaseCosts,
  RunningCosts,
} from '@/lib/aggregate/plan/calculators/model-purchase'
import type { PlanContextProperty, PlanContextLoan } from '@/lib/aggregate/plan/context'

// ── Helpers ──────────────────────────────────────────────────────────────────

function zeroPurchaseCosts(): PurchaseCosts {
  return {
    stampDutyCents: 0,
    legalCents: 0,
    buildingPestCents: 0,
    depreciationCents: 0,
    registrationCents: 0,
    buyerAgentCents: 0,
    renovationCents: 0,
  }
}

function zeroRunningCosts(): RunningCosts {
  return {
    councilRatesCents: 0,
    waterCents: 0,
    buildingInsCents: 0,
    landlordInsCents: 0,
    strataCents: 0,
    landTaxCents: 0,
    maintenanceCents: 0,
    adminCents: 0,
    pmFeePct: 0,
    vacancyPct: 0,
  }
}

function makeProperty(overrides: Partial<PlanContextProperty> = {}): PlanContextProperty {
  return {
    id: 'prop-1',
    address: '14 Elm St',
    nickname: null,
    startDate: '2020-01-01',
    endDate: null,
    purchasePriceCents: null,
    latestValuation: { valueCents: 150000000, valuedAt: '2026-01-01' }, // $1.5M
    ...overrides,
  }
}

function makeLoan(overrides: Partial<PlanContextLoan> = {}): PlanContextLoan {
  return {
    id: 'loan-1',
    lender: 'Westpac',
    nickname: null,
    propertyId: 'prop-1',
    loanType: 'interest_only',
    rateType: 'variable',
    interestRate: '6.35',
    ioEndDate: '2027-01-01',
    startDate: '2022-01-01',
    loanTermYears: 30,
    originalAmountCents: 60000000,
    latestBalance: { balanceCents: 60000000, recordedAt: '2026-01-01' }, // $600k
    ...overrides,
  }
}

const BASELINE = {
  rentMonthlyCents: 300000,
  expensesMonthlyCents: 50000,
  loanRepaymentsMonthlyCents: 200000,
}

function makeInput(overrides: Partial<ModelPurchaseInput> = {}): ModelPurchaseInput {
  return {
    purchasePriceCents: 78000000, // $780k
    weeklyRentCents: 64000,       // $640/wk
    depositPct: 20,
    lmiAmountCents: 0,
    newLoanRatePct: 6.35,
    newLoanTermYears: 30,
    newLoanType: 'interest_only',
    purchaseCosts: zeroPurchaseCosts(),
    runningCosts: zeroRunningCosts(),
    equitySources: [],
    properties: [makeProperty()],
    loans: [makeLoan()],
    portfolioBaseline: BASELINE,
    householdSurplusMonthlyCents: 500000,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeModelPurchase', () => {
  // 1. Monthly rent formula
  it('monthlyRentCents = round(weeklyRentCents × 52 / 12)', () => {
    const result = computeModelPurchase(makeInput({ weeklyRentCents: 64000 }))
    expect(result.monthlyRentCents).toBe(Math.round(64000 * 52 / 12))
    // $640/wk → $277,333 cents/mo ≈ $2,773/mo
    expect(result.monthlyRentCents).toBe(277333)
  })

  // 2. Negative gearing when repayment > rent
  it('gearing is negative when new loan repayment exceeds rent', () => {
    const result = computeModelPurchase(makeInput({
      purchasePriceCents: 100000000, // $1M
      weeklyRentCents: 30000,        // $300/wk → ~$1,300/mo
      depositPct: 20,                // loan = $800k
      newLoanRatePct: 10.0,          // IO: $800k × 10% / 12 ≈ $6,667/mo
      newLoanType: 'interest_only',
    }))
    expect(result.propertyCashflowMonthlyCents).toBeLessThan(0)
    expect(result.gearing).toBe('negative')
  })

  // 3. LMI threshold: LVR ≤ 80% → no LMI; LVR > 80% → LMI required
  it('depositPct 25 → lmiRequired false; depositPct 18 → lmiRequired true', () => {
    const low = computeModelPurchase(makeInput({ depositPct: 25 }))
    expect(low.lmiRequired).toBe(false)

    const high = computeModelPurchase(makeInput({ depositPct: 18 }))
    expect(high.lmiRequired).toBe(true)
  })

  // 4. LMI capitalised onto new loan
  it('newLoanCents = baseLoanCents + lmiAmountCents when LMI required', () => {
    const lmiAmountCents = 1500000 // $15k
    const result = computeModelPurchase(makeInput({
      depositPct: 18,
      lmiAmountCents,
    }))
    expect(result.lmiRequired).toBe(true)
    expect(result.lmiAmountCents).toBe(lmiAmountCents)
    expect(result.newLoanCents).toBe(result.baseLoanCents + lmiAmountCents)
  })

  // 5. Usable equity at 80% LVR; property without valuation excluded
  it('usableEquityCents = max(0, valuation × 0.80 − loanBalance); no-valuation property excluded', () => {
    const propWithVal = makeProperty({
      id: 'prop-a',
      latestValuation: { valueCents: 100000000, valuedAt: '2026-01-01' }, // $1M
    })
    const propNoVal = makeProperty({
      id: 'prop-b',
      latestValuation: null,
    })
    const loan = makeLoan({ propertyId: 'prop-a', latestBalance: { balanceCents: 60000000, recordedAt: '2026-01-01' } })

    const result = computeModelPurchase(makeInput({
      properties: [propWithVal, propNoVal],
      loans: [loan],
    }))

    // prop-a: usable = max(0, 100M × 0.80 - 60M) = 20M cents
    const entry = result.equityAvailable.find(e => e.propertyId === 'prop-a')
    expect(entry).toBeDefined()
    expect(entry!.usableEquityCents).toBe(Math.max(0, 0.8 * 100000000 - 60000000))
    expect(entry!.usableEquityCents).toBe(20000000)

    // prop-b: no valuation → not in list
    expect(result.equityAvailable.find(e => e.propertyId === 'prop-b')).toBeUndefined()
  })

  // 6. Blended portfolio LVR after purchase
  it('portfolioLvrAfter = (existingDebt + newLoan + equityDrawn) / (existingValue + purchasePrice)', () => {
    // existing: $1.5M value, $600k debt; purchase $780k, deposit 20% (loan $624k), equity draw $200k
    const equityDrawCents = 20000000
    const result = computeModelPurchase(makeInput({
      purchasePriceCents: 78000000,
      depositPct: 20,
      equitySources: [{ propertyId: 'prop-1', drawCents: equityDrawCents }],
    }))

    const existingValue = 150000000
    const existingDebt = 60000000
    const expectedNewLoan = Math.round(78000000 * 0.80) // $624k cents
    const valueAfter = existingValue + 78000000
    const debtAfter = existingDebt + expectedNewLoan + equityDrawCents
    const expectedLvr = debtAfter / valueAfter

    expect(result.portfolioDebtAfter).toBe(debtAfter)
    expect(result.portfolioValueAfter).toBe(valueAfter)
    expect(result.portfolioLvrAfter).toBeCloseTo(expectedLvr, 6)
  })

  // 7. Net portfolio cashflow after = baseline cashflow + property cashflow − equity interest
  it('portfolioCashflowAfterMonthlyCents = baseline + propertyCashflow − equityInterest', () => {
    const equityDrawCents = 20000000 // $200k
    const result = computeModelPurchase(makeInput({
      equitySources: [{ propertyId: 'prop-1', drawCents: equityDrawCents }],
      newLoanRatePct: 6.35,
    }))

    const baselineCashflow = BASELINE.rentMonthlyCents - BASELINE.expensesMonthlyCents - BASELINE.loanRepaymentsMonthlyCents
    const equityInterestMo = Math.round(equityDrawCents * 6.35 / 100 / 12)

    expect(result.portfolioCashflowAfterMonthlyCents).toBe(
      baselineCashflow + result.propertyCashflowMonthlyCents - equityInterestMo,
    )
  })

  // 8. Annual fixed running costs ÷ 12 = monthly (rounding verified)
  it('annual fixed running costs ÷ 12 = monthly running costs', () => {
    const councilRatesCents = 240000 // $2,400/yr
    const waterCents = 110000        // $1,100/yr
    const result = computeModelPurchase(makeInput({
      runningCosts: { ...zeroRunningCosts(), councilRatesCents, waterCents },
    }))

    const expectedMonthly = Math.round((councilRatesCents + waterCents) / 12)
    expect(result.runningCostsMonthlyCents).toBe(expectedMonthly)
  })

  // 9. PM fee = pmFeePct/100 × weeklyRentCents × 52, annual ÷ 12 monthly
  it('PM fee monthly = round(pmFeePct/100 × weeklyRentCents × 52 / 12)', () => {
    const pmFeePct = 8.5
    const weeklyRentCents = 64000
    const result = computeModelPurchase(makeInput({
      weeklyRentCents,
      runningCosts: { ...zeroRunningCosts(), pmFeePct },
    }))

    const pmFeeAnnual = (pmFeePct / 100) * weeklyRentCents * 52
    const expectedMonthly = Math.round(pmFeeAnnual / 12)
    expect(result.runningCostsMonthlyCents).toBe(expectedMonthly)
    // $640/wk × 52 × 8.5% = $2,828.80/yr → ~$235.73/mo → 23573 cents? No: in cents
    // 64000 × 52 = 3,328,000; × 8.5% = 282,880; / 12 = 23573.3 → 23573
    expect(result.runningCostsMonthlyCents).toBe(Math.round(pmFeePct / 100 * weeklyRentCents * 52 / 12))
  })

  // 10. Vacancy allowance reduces effective rent (computed as % of annual rent)
  it('vacancy reduces cashflow by vacancyPct/100 × weeklyRentCents × 52/12 per month', () => {
    const vacancyPct = 2
    const weeklyRentCents = 64000
    const withoutVacancy = computeModelPurchase(makeInput({ weeklyRentCents, runningCosts: zeroRunningCosts() }))
    const withVacancy = computeModelPurchase(makeInput({
      weeklyRentCents,
      runningCosts: { ...zeroRunningCosts(), vacancyPct },
    }))

    const vacancyMonthly = Math.round((vacancyPct / 100) * weeklyRentCents * 52 / 12)
    // Vacancy is included in running costs
    expect(withVacancy.runningCostsMonthlyCents).toBe(withoutVacancy.runningCostsMonthlyCents + vacancyMonthly)
    // Cashflow is reduced by the vacancy amount
    expect(withVacancy.propertyCashflowMonthlyCents).toBe(
      withoutVacancy.propertyCashflowMonthlyCents - vacancyMonthly,
    )
  })

  // Null baseline: cashflow fields are null
  it('portfolioCashflowMonthlyCents and After are null when portfolioBaseline is null', () => {
    const result = computeModelPurchase(makeInput({ portfolioBaseline: null }))
    expect(result.portfolioCashflowMonthlyCents).toBeNull()
    expect(result.portfolioCashflowAfterMonthlyCents).toBeNull()
  })

  // P&I loan type uses PMT
  it('P&I loan repayment uses PMT formula, not IO', () => {
    const io = computeModelPurchase(makeInput({ newLoanType: 'interest_only' }))
    const pni = computeModelPurchase(makeInput({ newLoanType: 'principal_and_interest' }))
    // P&I repayment > IO repayment for same loan
    expect(pni.newLoanRepaymentMonthlyCents).toBeGreaterThan(io.newLoanRepaymentMonthlyCents)
  })
})
