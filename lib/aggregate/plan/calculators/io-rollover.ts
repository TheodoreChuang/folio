import type { PlanContextLoan } from '@/lib/aggregate/plan/context'
import { pmt, interestOnlyPayment } from './rate-sensitivity'

export const DEFAULT_DISCOUNT = 0.30

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function yearsBetween(from: string, to: string): number {
  const msPerYear = 365.25 * 24 * 3600 * 1000
  return (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / msPerYear
}

export type IoRolloverRow = {
  loanId: string
  lender: string
  nickname: string | null
  balanceCents: number
  ioRate: number
  pAndIRate: number
  ioEndDate: string
  loanTermYears: number | null
  remainingPandIYears: number | null
  ioMonthlyRepaymentCents: number
  pAndIMonthlyRepaymentCents: number | null
  deltaCents: number | null
  termUnknown: boolean
}

export type IoRolloverResult = {
  rows: IoRolloverRow[]
  totalAdditionalMonthlyCents: number
  totalAdditionalAnnualCents: number
}

export function computeIoRollover(
  loans: PlanContextLoan[],
  editableRates: Record<string, number>,
  today: Date = new Date(),
): IoRolloverResult {
  const rows: IoRolloverRow[] = []
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  for (const loan of loans) {
    if (loan.loanType !== 'interest_only') continue
    if (!loan.ioEndDate) continue
    if (parseLocalDate(loan.ioEndDate) < todayMidnight) continue
    if (!loan.interestRate) continue

    const balanceCents = loan.latestBalance?.balanceCents ?? null
    if (balanceCents === null) continue

    const ioRate = parseFloat(loan.interestRate)
    if (Number.isNaN(ioRate)) continue

    const pAndIRate =
      editableRates[loan.id] !== undefined
        ? editableRates[loan.id]
        : Math.max(0, round2(ioRate - DEFAULT_DISCOUNT))

    const ioMonthlyRepaymentCents = interestOnlyPayment(ioRate, balanceCents)

    let remainingPandIYears: number | null = null
    let termUnknown = false

    if (loan.loanTermYears === null || loan.startDate === null) {
      termUnknown = true
    } else {
      const ioYears = yearsBetween(loan.startDate, loan.ioEndDate)
      const remaining = loan.loanTermYears - ioYears
      // If ioYears > loanTermYears the data is inconsistent — flag as unknown rather than clamping to 1 month
      if (remaining <= 0) {
        termUnknown = true
      } else {
        remainingPandIYears = remaining
      }
    }

    const pAndIMonthlyRepaymentCents =
      !termUnknown && remainingPandIYears !== null
        ? pmt(pAndIRate, Math.round(remainingPandIYears * 12), balanceCents)
        : null

    const deltaCents =
      pAndIMonthlyRepaymentCents !== null
        ? pAndIMonthlyRepaymentCents - ioMonthlyRepaymentCents
        : null

    rows.push({
      loanId: loan.id,
      lender: loan.lender,
      nickname: loan.nickname,
      balanceCents,
      ioRate,
      pAndIRate,
      ioEndDate: loan.ioEndDate,
      loanTermYears: loan.loanTermYears,
      remainingPandIYears,
      ioMonthlyRepaymentCents,
      pAndIMonthlyRepaymentCents,
      deltaCents,
      termUnknown,
    })
  }

  rows.sort((a, b) => a.ioEndDate.localeCompare(b.ioEndDate))

  const totalAdditionalMonthlyCents = rows.reduce((s, r) => s + (r.deltaCents ?? 0), 0)
  const totalAdditionalAnnualCents = totalAdditionalMonthlyCents * 12

  return {
    rows,
    totalAdditionalMonthlyCents,
    totalAdditionalAnnualCents,
  }
}
