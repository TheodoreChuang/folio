import { pmt, interestOnlyPayment } from './rate-sensitivity'
import type { PlanContextLoan } from '@/lib/aggregate/plan/context'

export type SellingCosts = {
  commissionPct: number
  legalCents: number
  marketingCents: number
  otherCents: number
}

export type BuyingCosts = {
  stampDutyCents: number
  legalCents: number
  buildingPestCents: number
  otherCents: number
}

export type HoldReinvestInput = {
  selectedPropertyId: string
  salePriceCents: number
  cgtCents: number
  newLoanRatePct: number
  newLoanTermYears: number
  newLoanType: 'principal_and_interest' | 'interest_only'
  lmiAmountCents: number
  holdGrowthRatePct: number
  reinvestGrowthRatePct: number
  horizonYears: number
  sellingCosts: SellingCosts
  buyingCosts: BuyingCosts
  loans: PlanContextLoan[]
}

export type SaleSummary = {
  sellingCostsCents: number
  grossProceedsCents: number
  loanPayoutsCents: number
  netAfterLoansCents: number
  netAfterCgtCents: number
}

export type ReinvestSummary = {
  purchasePriceCents: number
  buyingCostsCents: number
  netDepositCents: number
  newLoanCents: number
  lvrRatio: number
  effectiveNewLoanCents: number
  newLoanRepaymentMonthlyCents: number
}

export type HoldReinvestResult = {
  saleSummary: SaleSummary
  reinvestSummary: ReinvestSummary
  showLmi: boolean
  frictionCents: number
  frictionPct: number
  trajectories: {
    holdEquityByYear: number[]
    reinvestEquityByYear: number[]
  }
  breakEvenYear: number | null
  blocked: boolean
  blockedReason: string | null
}

export function computeHoldReinvest(input: HoldReinvestInput): HoldReinvestResult {
  const {
    selectedPropertyId,
    salePriceCents,
    cgtCents,
    newLoanRatePct,
    newLoanTermYears,
    newLoanType,
    lmiAmountCents: inputLmi,
    holdGrowthRatePct,
    reinvestGrowthRatePct,
    horizonYears,
    sellingCosts,
    buyingCosts,
    loans,
  } = input

  // ── Selling costs ────────────────────────────────────────────────────────────
  const commissionCents = Math.round(salePriceCents * sellingCosts.commissionPct / 100)
  const sellingCostsCents =
    commissionCents + sellingCosts.legalCents + sellingCosts.marketingCents + sellingCosts.otherCents

  const grossProceedsCents = salePriceCents - sellingCostsCents

  // ── Loan payouts ─────────────────────────────────────────────────────────────
  // Only loans secured against the selected property with a recorded balance
  const loanPayoutsCents = loans
    .filter(l => l.propertyId === selectedPropertyId && l.latestBalance !== null)
    .reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)

  const netAfterLoansCents = grossProceedsCents - loanPayoutsCents
  const netAfterCgtCents = netAfterLoansCents - cgtCents

  // ── Buying costs for replacement ─────────────────────────────────────────────
  const buyingCostsCents =
    buyingCosts.stampDutyCents +
    buyingCosts.legalCents +
    buyingCosts.buildingPestCents +
    buyingCosts.otherCents

  // ── Funding ──────────────────────────────────────────────────────────────────
  const netDepositCents = netAfterCgtCents - buyingCostsCents

  const blocked = netDepositCents <= 0
  const blockedReason = blocked
    ? 'Net proceeds after costs, CGT and buying expenses are insufficient to fund a replacement deposit.'
    : null

  // Equal-value reinvestment: purchase price = sale price
  const purchasePriceCents = salePriceCents
  const newLoanCents = Math.max(0, purchasePriceCents - netDepositCents)
  const lvrRatio = purchasePriceCents > 0 ? newLoanCents / purchasePriceCents : 0
  const lmiRequired = lvrRatio > 0.8
  const lmiAmountCents = lmiRequired ? inputLmi : 0
  const effectiveNewLoanCents = newLoanCents + lmiAmountCents

  const newLoanRepaymentMonthlyCents =
    newLoanType === 'interest_only'
      ? interestOnlyPayment(newLoanRatePct, effectiveNewLoanCents)
      : pmt(newLoanRatePct, Math.max(1, newLoanTermYears * 12), effectiveNewLoanCents)

  // ── Friction ─────────────────────────────────────────────────────────────────
  // = effectiveNewLoan − outstandingLoans = all transaction costs absorbed
  const frictionCents = sellingCostsCents + cgtCents + buyingCostsCents + lmiAmountCents
  const frictionPct = purchasePriceCents > 0 ? (frictionCents / purchasePriceCents) * 100 : 0

  // ── Equity trajectories ───────────────────────────────────────────────────────
  const holdGrowth = holdGrowthRatePct / 100
  const reinvestGrowth = reinvestGrowthRatePct / 100
  const holdEquityByYear: number[] = []
  const reinvestEquityByYear: number[] = []

  for (let yr = 0; yr <= horizonYears; yr++) {
    holdEquityByYear.push(
      Math.round(salePriceCents * Math.pow(1 + holdGrowth, yr) - loanPayoutsCents),
    )
    reinvestEquityByYear.push(
      Math.round(purchasePriceCents * Math.pow(1 + reinvestGrowth, yr) - effectiveNewLoanCents),
    )
  }

  // ── Break-even ────────────────────────────────────────────────────────────────
  let breakEvenYear: number | null = null
  if (!blocked) {
    for (let yr = 1; yr <= horizonYears; yr++) {
      if (reinvestEquityByYear[yr] > holdEquityByYear[yr]) {
        breakEvenYear = yr
        break
      }
    }
  }

  return {
    saleSummary: {
      sellingCostsCents,
      grossProceedsCents,
      loanPayoutsCents,
      netAfterLoansCents,
      netAfterCgtCents,
    },
    reinvestSummary: {
      purchasePriceCents,
      buyingCostsCents,
      netDepositCents,
      newLoanCents,
      lvrRatio,
      effectiveNewLoanCents,
      newLoanRepaymentMonthlyCents,
    },
    showLmi: lmiRequired,
    frictionCents,
    frictionPct,
    trajectories: { holdEquityByYear, reinvestEquityByYear },
    breakEvenYear,
    blocked,
    blockedReason,
  }
}
