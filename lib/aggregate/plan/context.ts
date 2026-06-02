import { fetchPortfolioData } from '@/lib/aggregate/repositories/portfolio'
import { fetchLedgerEntriesInRange } from '@/lib/aggregate/repositories/ledger'
import { listBudgetItems } from '@/lib/household/repositories/budget-items'
import { computeSummary } from '@/lib/household/compute'
import { computeReport } from '@/lib/aggregate/services/compute'
import type { LoanType, RateType } from '@/db/schema'
import type { ValuationSnapshot, BalanceSnapshot } from '@/lib/aggregate/repositories/portfolio'

export type PlanContextProperty = {
  id: string
  address: string
  nickname: string | null
  startDate: string
  endDate: string | null
  latestValuation: { valueCents: number; valuedAt: string } | null
}

export type PlanContextLoan = {
  id: string
  lender: string
  nickname: string | null
  propertyId: string | null
  loanType: LoanType | null
  rateType: RateType | null
  interestRate: string | null
  ioEndDate: string | null
  loanTermYears: number | null
  originalAmountCents: number | null
  latestBalance: { balanceCents: number; recordedAt: string } | null
}

export type PlanContext = {
  counts: { variableLoans: number; ioLoans: number; properties: number }
  properties: PlanContextProperty[]
  loans: PlanContextLoan[]
  householdSurplusMonthlyCents: number | null
  portfolioBaseline: {
    rentMonthlyCents: number
    expensesMonthlyCents: number
    loanRepaymentsMonthlyCents: number
  } | null
}

// Trailing 3 full calendar months: first day 3 months ago → last day of last month
function trailingThreeMonthRange(today: Date): { from: string; to: string } {
  const from = new Date(today.getFullYear(), today.getMonth() - 3, 1)
  const to = new Date(today.getFullYear(), today.getMonth(), 0) // last day of prev month
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function latestByKey<T>(rows: T[], keyFn: (r: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    if (!map.has(keyFn(row))) map.set(keyFn(row), row)
  }
  return map
}

export async function fetchPlanContext(userId: string): Promise<PlanContext> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const { from, to } = trailingThreeMonthRange(today)

  const [{ properties, valuations, balances, loans }, budgetItems, ledgerEntries] =
    await Promise.all([
      fetchPortfolioData(userId),
      listBudgetItems(userId),
      fetchLedgerEntriesInRange(userId, from, to),
    ])

  const activeProperties = properties.filter(p => !p.endDate || p.endDate > todayStr)
  const activeLoans = loans.filter(l => !l.endDate || l.endDate > todayStr)

  const latestValuationMap = latestByKey(valuations, (v: ValuationSnapshot) => v.propertyId)
  const latestBalanceMap = latestByKey(balances, (b: BalanceSnapshot) => b.installmentLoanId)

  const variableLoans = activeLoans.filter(
    l => l.rateType === 'variable' || l.loanType === 'line_of_credit',
  ).length
  const ioLoans = activeLoans.filter(
    l => l.loanType === 'interest_only' && l.ioEndDate !== null,
  ).length

  const propertiesOut: PlanContextProperty[] = activeProperties.map(p => {
    const v = latestValuationMap.get(p.id)
    return {
      id: p.id,
      address: p.address,
      nickname: p.nickname,
      startDate: p.startDate,
      endDate: p.endDate ?? null,
      latestValuation: v ? { valueCents: v.valueCents, valuedAt: v.valuedAt } : null,
    }
  })

  const loansOut: PlanContextLoan[] = activeLoans.map(l => {
    const b = latestBalanceMap.get(l.id)
    return {
      id: l.id,
      lender: l.lender,
      nickname: l.nickname,
      propertyId: l.propertyId ?? null,
      loanType: l.loanType ?? null,
      rateType: l.rateType ?? null,
      interestRate: l.interestRate ?? null,
      ioEndDate: l.ioEndDate ?? null,
      loanTermYears: l.loanTermYears ?? null,
      originalAmountCents: l.originalAmountCents ?? null,
      latestBalance: b ? { balanceCents: b.balanceCents, recordedAt: b.recordedAt } : null,
    }
  })

  const householdSurplusMonthlyCents =
    budgetItems.length === 0 ? null : computeSummary(budgetItems).surplusMonthlyCents

  let portfolioBaseline: PlanContext['portfolioBaseline'] = null
  if (ledgerEntries.length > 0) {
    const { totals } = computeReport(ledgerEntries, activeProperties, activeLoans)
    portfolioBaseline = {
      rentMonthlyCents: Math.round(totals.totalRent / 3),
      expensesMonthlyCents: Math.round(totals.totalExpenses / 3),
      loanRepaymentsMonthlyCents: Math.round(totals.totalMortgage / 3),
    }
  }

  return {
    counts: { variableLoans, ioLoans, properties: activeProperties.length },
    properties: propertiesOut,
    loans: loansOut,
    householdSurplusMonthlyCents,
    portfolioBaseline,
  }
}
