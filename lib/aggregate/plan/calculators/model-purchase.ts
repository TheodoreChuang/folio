import { pmt, interestOnlyPayment } from './rate-sensitivity'
import type { PlanContextProperty, PlanContextLoan, PlanContext } from '@/lib/aggregate/plan/context'

export type PurchaseCosts = {
  stampDutyCents: number
  legalCents: number
  buildingPestCents: number
  depreciationCents: number
  registrationCents: number
  buyerAgentCents: number
  renovationCents: number
}

export type RunningCosts = {
  councilRatesCents: number
  waterCents: number
  buildingInsCents: number
  landlordInsCents: number
  strataCents: number
  landTaxCents: number
  maintenanceCents: number
  adminCents: number
  // entered as a percentage of gross annual rent (e.g. 8.5 for 8.5%)
  pmFeePct: number
  // entered as a percentage of gross annual rent (e.g. 2 for 2%)
  vacancyPct: number
}

export type EquitySource = {
  propertyId: string
  drawCents: number
}

export type ModelPurchaseInput = {
  purchasePriceCents: number
  weeklyRentCents: number
  depositPct: number
  // user-estimated LMI capitalised onto the loan when lmiRequired
  lmiAmountCents: number
  newLoanRatePct: number
  newLoanTermYears: number
  newLoanType: 'principal_and_interest' | 'interest_only'
  purchaseCosts: PurchaseCosts
  runningCosts: RunningCosts
  equitySources: EquitySource[]
  properties: PlanContextProperty[]
  loans: PlanContextLoan[]
  portfolioBaseline: PlanContext['portfolioBaseline']
  householdSurplusMonthlyCents: number | null
}

export type EquityAvailable = {
  propertyId: string
  address: string
  nickname: string | null
  valuationCents: number
  outstandingCents: number
  usableEquityCents: number
}

export type ModelPurchaseResult = {
  // New property metrics
  monthlyRentCents: number
  purchaseCostsTotalCents: number
  depositCents: number
  baseLoanCents: number
  lmiRequired: boolean
  lmiAmountCents: number
  newLoanCents: number
  newLoanRepaymentMonthlyCents: number
  runningCostsMonthlyCents: number
  propertyCashflowMonthlyCents: number
  gearing: 'positive' | 'neutral' | 'negative'

  // Funding
  fundsRequiredCents: number
  equityDrawnCents: number
  cashContributionCents: number
  shortfallCents: number

  // Equity per existing property (only those with a valuation)
  equityAvailable: EquityAvailable[]

  // Portfolio impact
  portfolioValueBefore: number
  portfolioValueAfter: number
  portfolioDebtBefore: number
  portfolioDebtAfter: number
  portfolioLvrBefore: number
  portfolioLvrAfter: number
  portfolioCashflowMonthlyCents: number | null
  portfolioCashflowAfterMonthlyCents: number | null

  // Household
  householdSurplusMonthlyCents: number | null
}

export function computeModelPurchase(input: ModelPurchaseInput): ModelPurchaseResult {
  const {
    purchasePriceCents,
    weeklyRentCents,
    depositPct,
    lmiAmountCents: inputLmi,
    newLoanRatePct,
    newLoanTermYears,
    newLoanType,
    purchaseCosts,
    runningCosts,
    equitySources,
    properties,
    loans,
    portfolioBaseline,
    householdSurplusMonthlyCents,
  } = input

  // ── Rent ────────────────────────────────────────────────────────────────────
  const monthlyRentCents = Math.round(weeklyRentCents * 52 / 12)
  const annualRentCents = weeklyRentCents * 52

  // ── Loan sizing ─────────────────────────────────────────────────────────────
  const depositCents = Math.round(purchasePriceCents * depositPct / 100)
  const baseLoanCents = Math.max(0, purchasePriceCents - depositCents)
  const lvrRatio = purchasePriceCents > 0 ? baseLoanCents / purchasePriceCents : 0
  const lmiRequired = lvrRatio > 0.8
  const lmiAmountCents = lmiRequired ? inputLmi : 0
  const newLoanCents = baseLoanCents + lmiAmountCents

  // ── New loan repayment ───────────────────────────────────────────────────────
  const newLoanRepaymentMonthlyCents =
    newLoanType === 'interest_only'
      ? interestOnlyPayment(newLoanRatePct, newLoanCents)
      : pmt(newLoanRatePct, Math.max(1, newLoanTermYears * 12), newLoanCents)

  // ── Purchase costs ──────────────────────────────────────────────────────────
  const purchaseCostsTotalCents =
    purchaseCosts.stampDutyCents +
    purchaseCosts.legalCents +
    purchaseCosts.buildingPestCents +
    purchaseCosts.depreciationCents +
    purchaseCosts.registrationCents +
    purchaseCosts.buyerAgentCents +
    purchaseCosts.renovationCents

  // ── Running costs ───────────────────────────────────────────────────────────
  const fixedAnnualCents =
    runningCosts.councilRatesCents +
    runningCosts.waterCents +
    runningCosts.buildingInsCents +
    runningCosts.landlordInsCents +
    runningCosts.strataCents +
    runningCosts.landTaxCents +
    runningCosts.maintenanceCents +
    runningCosts.adminCents

  // Percentage costs are computed as a fraction of gross annual rent
  const pmFeeAnnualCents = (runningCosts.pmFeePct / 100) * annualRentCents
  const vacancyAnnualCents = (runningCosts.vacancyPct / 100) * annualRentCents

  const runningCostsMonthlyCents = Math.round(
    (fixedAnnualCents + pmFeeAnnualCents + vacancyAnnualCents) / 12,
  )

  // ── Property cashflow ────────────────────────────────────────────────────────
  const propertyCashflowMonthlyCents =
    monthlyRentCents - newLoanRepaymentMonthlyCents - runningCostsMonthlyCents

  const gearing: ModelPurchaseResult['gearing'] =
    propertyCashflowMonthlyCents > 50
      ? 'positive'
      : propertyCashflowMonthlyCents < -50
        ? 'negative'
        : 'neutral'

  // ── Funding ─────────────────────────────────────────────────────────────────
  const fundsRequiredCents = depositCents + purchaseCostsTotalCents

  const equityDrawnCents = equitySources.reduce((sum, s) => sum + s.drawCents, 0)
  const cashContributionCents = Math.max(0, fundsRequiredCents - equityDrawnCents)
  const allocated = equityDrawnCents + cashContributionCents
  const shortfallCents = Math.max(0, fundsRequiredCents - allocated)

  // ── Equity available per property ────────────────────────────────────────────
  // Sum loan balances per property
  const debtByProperty = new Map<string, number>()
  for (const loan of loans) {
    if (!loan.propertyId || !loan.latestBalance) continue
    debtByProperty.set(
      loan.propertyId,
      (debtByProperty.get(loan.propertyId) ?? 0) + loan.latestBalance.balanceCents,
    )
  }

  const equityAvailable: EquityAvailable[] = []
  for (const prop of properties) {
    if (!prop.latestValuation) continue
    const val = prop.latestValuation.valueCents
    const outstanding = debtByProperty.get(prop.id) ?? 0
    const usableEquityCents = Math.max(0, Math.round(val * 0.8) - outstanding)
    equityAvailable.push({
      propertyId: prop.id,
      address: prop.address,
      nickname: prop.nickname,
      valuationCents: val,
      outstandingCents: outstanding,
      usableEquityCents,
    })
  }

  // ── Portfolio rollup ─────────────────────────────────────────────────────────
  const portfolioValueBefore = properties.reduce(
    (sum, p) => sum + (p.latestValuation?.valueCents ?? 0),
    0,
  )
  const portfolioDebtBefore = loans.reduce(
    (sum, l) => sum + (l.latestBalance?.balanceCents ?? 0),
    0,
  )
  const portfolioValueAfter = portfolioValueBefore + purchasePriceCents
  // Equity drawn adds to debt (it's an additional borrowing against existing properties)
  const portfolioDebtAfter = portfolioDebtBefore + newLoanCents + equityDrawnCents

  const portfolioLvrBefore =
    portfolioValueBefore > 0 ? portfolioDebtBefore / portfolioValueBefore : 0
  const portfolioLvrAfter =
    portfolioValueAfter > 0 ? portfolioDebtAfter / portfolioValueAfter : 0

  // ── Portfolio cashflow ───────────────────────────────────────────────────────
  let portfolioCashflowMonthlyCents: number | null = null
  let portfolioCashflowAfterMonthlyCents: number | null = null

  if (portfolioBaseline !== null) {
    portfolioCashflowMonthlyCents =
      portfolioBaseline.rentMonthlyCents -
      portfolioBaseline.expensesMonthlyCents -
      portfolioBaseline.loanRepaymentsMonthlyCents

    // Equity drawn accrues interest at the new loan rate (interest-only on the release)
    const equityInterestMonthlyCents = Math.round(equityDrawnCents * newLoanRatePct / 100 / 12)

    portfolioCashflowAfterMonthlyCents =
      portfolioCashflowMonthlyCents +
      propertyCashflowMonthlyCents -
      equityInterestMonthlyCents
  }

  return {
    monthlyRentCents,
    purchaseCostsTotalCents,
    depositCents,
    baseLoanCents,
    lmiRequired,
    lmiAmountCents,
    newLoanCents,
    newLoanRepaymentMonthlyCents,
    runningCostsMonthlyCents,
    propertyCashflowMonthlyCents,
    gearing,
    fundsRequiredCents,
    equityDrawnCents,
    cashContributionCents,
    shortfallCents,
    equityAvailable,
    portfolioValueBefore,
    portfolioValueAfter,
    portfolioDebtBefore,
    portfolioDebtAfter,
    portfolioLvrBefore,
    portfolioLvrAfter,
    portfolioCashflowMonthlyCents,
    portfolioCashflowAfterMonthlyCents,
    householdSurplusMonthlyCents,
  }
}
