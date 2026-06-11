import type { PropertyLedger, Property, InstallmentLoan } from '@/db/schema'
import { CATEGORY_BUCKET } from '@/lib/ledger-categories'

// ── return metrics ──────────────────────────────────────────────────────────

export type InsightsReturn = {
  grossYieldPct: number | null
  capitalGrowthPct: number | null
  capitalGrowthCents: number | null
  totalReturnPct: number | null
  annualisedRentCents: number
  currentValueCents: number
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

export function computeReturn(input: {
  endValuations: Array<{ valueCents: number }>
  startValuations: Array<{ valueCents: number }>
  periodRentCents: number
  periodMonths: number
}): InsightsReturn {
  const { endValuations, startValuations, periodRentCents, periodMonths } = input

  const currentValueCents = endValuations.reduce((s, v) => s + v.valueCents, 0)

  // startValueCents is unavailable when we have end valuations but no start
  const startValueCents =
    endValuations.length > 0 && startValuations.length === 0
      ? null
      : startValuations.reduce((s, v) => s + v.valueCents, 0)

  const annualisedRentCents =
    periodMonths > 0 ? Math.round((periodRentCents / periodMonths) * 12) : 0

  const grossYieldPct =
    currentValueCents > 0
      ? round((annualisedRentCents / currentValueCents) * 100, 2)
      : null

  const capitalGrowthPct =
    startValueCents === null || startValueCents === 0
      ? null
      : round(((currentValueCents - startValueCents) / startValueCents) * 100, 2)

  const capitalGrowthCents =
    startValueCents === null ? null : currentValueCents - startValueCents

  const totalReturnPct =
    grossYieldPct !== null && capitalGrowthPct !== null
      ? round(grossYieldPct + capitalGrowthPct, 2)
      : null

  return {
    grossYieldPct,
    capitalGrowthPct,
    capitalGrowthCents,
    totalReturnPct,
    annualisedRentCents,
    currentValueCents,
  }
}

export type PropertyTotals = {
  propertyId: string
  address: string
  nickname: string | null
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasStatement: boolean
  hasMortgage: boolean
}

export type ReportTotals = {
  totalRent: number
  totalExpenses: number
  totalMortgage: number
  netBeforeMortgage: number
  netAfterMortgage: number
  statementsReceived: number
  mortgagesProvided: number
  propertyCount: number
  properties: PropertyTotals[]
}

export type MissingMortgage = {
  installmentLoanId: string
  lender: string
  nickname: string | null
  propertyId: string
  address: string
}

export type ReportFlags = {
  missingStatements: string[]
  missingMortgages: MissingMortgage[]
}

export function computeReport(
  entries: PropertyLedger[],
  properties: Property[],
  installmentLoans: InstallmentLoan[] = [],
): { totals: ReportTotals; flags: ReportFlags } {
  const propertyTotals: PropertyTotals[] = properties.map((p) => {
    const propEntries = entries.filter((e) => e.propertyId === p.id)

    const rentCents = propEntries
      .filter((e) => e.category === 'rent')
      .reduce((s, e) => s + e.amountCents, 0)

    const expensesCents = propEntries
      .filter((e) => CATEGORY_BUCKET[e.category] === 'expense')
      .reduce((s, e) => s + e.amountCents, 0)

    const mortgageCents = propEntries
      .filter((e) => e.category === 'loan_payment')
      .reduce((s, e) => s + e.amountCents, 0)

    const hasStatement = propEntries.some((e) => e.category !== 'loan_payment')
    const hasMortgage = propEntries.some((e) => e.category === 'loan_payment')

    return {
      propertyId: p.id,
      address: p.address,
      nickname: p.nickname,
      rentCents,
      expensesCents,
      mortgageCents,
      netCents: rentCents - expensesCents - mortgageCents,
      hasStatement,
      hasMortgage,
    }
  })

  const totalRent = propertyTotals.reduce((s, p) => s + p.rentCents, 0)
  const totalExpenses = propertyTotals.reduce((s, p) => s + p.expensesCents, 0)
  const totalMortgage = propertyTotals.reduce((s, p) => s + p.mortgageCents, 0)
  const netBeforeMortgage = totalRent - totalExpenses
  const netAfterMortgage = netBeforeMortgage - totalMortgage
  const statementsReceived = propertyTotals.filter((p) => p.hasStatement).length
  const mortgagesProvided = propertyTotals.filter((p) => p.hasMortgage).length

  const totals: ReportTotals = {
    totalRent,
    totalExpenses,
    totalMortgage,
    netBeforeMortgage,
    netAfterMortgage,
    statementsReceived,
    mortgagesProvided,
    propertyCount: properties.length,
    properties: propertyTotals,
  }

  const missingMortgages: MissingMortgage[] = []
  for (const p of properties) {
    const propEntries = entries.filter((e) => e.propertyId === p.id)
    const propertyLoans = installmentLoans.filter((l) => l.propertyId === p.id)
    for (const loan of propertyLoans) {
      const hasPaid = propEntries.some(
        (e) => e.category === 'loan_payment' && e.installmentLoanId === loan.id,
      )
      if (!hasPaid) {
        missingMortgages.push({
          installmentLoanId: loan.id,
          lender: loan.lender,
          nickname: loan.nickname,
          propertyId: p.id,
          address: p.address,
        })
      }
    }
  }

  const flags: ReportFlags = {
    missingStatements: propertyTotals.filter((p) => !p.hasStatement).map((p) => p.propertyId),
    missingMortgages,
  }

  return { totals, flags }
}
