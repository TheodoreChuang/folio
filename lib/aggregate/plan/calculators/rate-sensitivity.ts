import type { PlanContext, PlanContextLoan } from '@/lib/aggregate/plan/context'

// PMT formula: monthly payment for a P&I loan.
// r = monthly rate (decimal), n = number of months, pv = principal in cents
export function pmt(annualRatePct: number, termMonths: number, balanceCents: number): number {
  const r = annualRatePct / 100 / 12
  if (r === 0) return Math.round(balanceCents / termMonths)
  return Math.round((r * balanceCents) / (1 - Math.pow(1 + r, -termMonths)))
}

export function interestOnlyPayment(annualRatePct: number, balanceCents: number): number {
  return Math.round((annualRatePct / 100 / 12) * balanceCents)
}

export type RateSensitivityLoanRow = {
  loanId: string
  lender: string
  nickname: string | null
  balanceCents: number
  baseRate: number       // annual %, as parsed from DB
  newRate: number        // baseRate + delta
  todayRepaymentCents: number
  deltaRepaymentCents: number  // repayment at newRate
  changeCents: number          // deltaRepayment - todayRepayment (positive = more expensive)
}

export type RateSensitivityResult = {
  perLoan: RateSensitivityLoanRow[]
  excludedCount: number
  totalTodayRepaymentsCents: number
  totalDeltaRepaymentsCents: number
  totalChangeCents: number        // positive = more expensive
  portfolioCashflowTodayCents: number | null
  portfolioCashflowAtDeltaCents: number | null
}

function isVariableLoan(loan: PlanContextLoan): boolean {
  return loan.rateType === 'variable' || loan.loanType === 'line_of_credit'
}

function computeRepayment(loan: PlanContextLoan, rate: number, balanceCents: number): number {
  if (loan.loanType === 'interest_only' || loan.loanType === 'line_of_credit') {
    return interestOnlyPayment(rate, balanceCents)
  }
  const termMonths = (loan.loanTermYears ?? 0) * 12
  if (termMonths <= 0) return 0
  return pmt(rate, termMonths, balanceCents)
}

export function computeRateSensitivity(
  loans: PlanContextLoan[],
  delta: number,
  baseline: PlanContext['portfolioBaseline'],
  householdSurplusMonthlyCents: number | null,
): RateSensitivityResult & { householdSurplusMonthlyCents: number | null } {
  const perLoan: RateSensitivityLoanRow[] = []
  let excludedCount = 0

  for (const loan of loans) {
    if (!isVariableLoan(loan)) continue

    // Fixed-rate loans are excluded even if somehow in variable group
    if (loan.rateType === 'fixed') continue

    const balance = loan.latestBalance?.balanceCents ?? null
    if (balance === null) { excludedCount++; continue }

    const rateStr = loan.interestRate
    if (rateStr === null) { excludedCount++; continue }
    const baseRate = parseFloat(rateStr)
    if (Number.isNaN(baseRate)) { excludedCount++; continue }

    // P&I loans with no term are excluded (can't compute repayment)
    if (loan.loanType !== 'interest_only' && loan.loanType !== 'line_of_credit') {
      if (!loan.loanTermYears) { excludedCount++; continue }
    }

    const newRate = baseRate + delta
    const todayRepaymentCents = computeRepayment(loan, baseRate, balance)
    const deltaRepaymentCents = computeRepayment(loan, newRate, balance)

    perLoan.push({
      loanId: loan.id,
      lender: loan.lender,
      nickname: loan.nickname,
      balanceCents: balance,
      baseRate,
      newRate,
      todayRepaymentCents,
      deltaRepaymentCents,
      changeCents: deltaRepaymentCents - todayRepaymentCents,
    })
  }

  const totalTodayRepaymentsCents = perLoan.reduce((s, r) => s + r.todayRepaymentCents, 0)
  const totalDeltaRepaymentsCents = perLoan.reduce((s, r) => s + r.deltaRepaymentCents, 0)
  const totalChangeCents = totalDeltaRepaymentsCents - totalTodayRepaymentsCents

  // Portfolio cashflow uses baseline rent/expenses + computed repayments (not ledger repayments)
  // so that at delta=0 the change reads zero exactly.
  let portfolioCashflowTodayCents: number | null = null
  let portfolioCashflowAtDeltaCents: number | null = null
  if (baseline !== null) {
    const base = baseline.rentMonthlyCents - baseline.expensesMonthlyCents
    portfolioCashflowTodayCents = base - totalTodayRepaymentsCents
    portfolioCashflowAtDeltaCents = base - totalDeltaRepaymentsCents
  }

  return {
    perLoan,
    excludedCount,
    totalTodayRepaymentsCents,
    totalDeltaRepaymentsCents,
    totalChangeCents,
    portfolioCashflowTodayCents,
    portfolioCashflowAtDeltaCents,
    householdSurplusMonthlyCents,
  }
}
