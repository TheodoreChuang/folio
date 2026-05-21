import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, installmentLoanBalances } from '@/db/schema'
import { findPropertyById } from '@/lib/property/repositories/properties'
import { findLatestValuation } from '@/lib/property/repositories/valuations'
import { findTrailing12mEntries } from '@/lib/property/repositories/ledger'
import type { Property, PropertyValuation } from '@/db/schema'

type YieldStats = {
  grossPercent: number
  netPercent: number
  periodLabel: string
}

type LatestValuation = Pick<PropertyValuation, 'valueCents' | 'valuedAt' | 'source'>

type PropertyWithStats = {
  property: Property
  latestValuation: LatestValuation | null
  yield: YieldStats | null
  totalDebtCents: number
  equityCents: number | null
  lvrDecimal: number | null
  totalAppreciationCents: number | null
}

export async function getPropertyWithStats(
  userId: string,
  propertyId: string,
): Promise<PropertyWithStats | null> {
  const property = await findPropertyById(userId, propertyId)
  if (!property) return null

  const [valuationRow, ledgerEntries, propertyLoans] = await Promise.all([
    findLatestValuation(userId, propertyId),
    findTrailing12mEntries(userId, propertyId),
    db.select({ id: installmentLoans.id })
      .from(installmentLoans)
      .where(and(eq(installmentLoans.propertyId, propertyId), eq(installmentLoans.userId, userId))),
  ])

  const latestValuation = valuationRow
    ? { valueCents: valuationRow.valueCents, valuedAt: valuationRow.valuedAt, source: valuationRow.source }
    : null

  let totalDebtCents = 0
  if (propertyLoans.length > 0) {
    const loanIds = propertyLoans.map(l => l.id)
    const balanceRows = await db
      .select()
      .from(installmentLoanBalances)
      .where(and(
        eq(installmentLoanBalances.userId, userId),
        inArray(installmentLoanBalances.installmentLoanId, loanIds),
      ))
      .orderBy(installmentLoanBalances.installmentLoanId, desc(installmentLoanBalances.recordedAt))
    const seen = new Set<string>()
    for (const row of balanceRows) {
      if (!seen.has(row.installmentLoanId)) {
        seen.add(row.installmentLoanId)
        totalDebtCents += row.balanceCents
      }
    }
  }

  const equityCents = latestValuation ? latestValuation.valueCents - totalDebtCents : null
  const lvrDecimal =
    latestValuation && latestValuation.valueCents > 0 && totalDebtCents > 0
      ? totalDebtCents / latestValuation.valueCents
      : null
  const totalAppreciationCents =
    latestValuation && property.purchasePriceCents
      ? latestValuation.valueCents - property.purchasePriceCents
      : null

  let yieldStats: YieldStats | null = null
  if (latestValuation) {
    let trailing12mRent = 0
    let trailing12mExpenses = 0
    for (const e of ledgerEntries) {
      if (e.category === 'rent') {
        trailing12mRent += e.amountCents
      } else if (e.category !== 'loan_payment') {
        trailing12mExpenses += e.amountCents
      }
    }
    const val = latestValuation.valueCents
    yieldStats = {
      grossPercent: Math.round((trailing12mRent / val) * 10000) / 100,
      netPercent: Math.round(((trailing12mRent - trailing12mExpenses) / val) * 10000) / 100,
      periodLabel: 'trailing 12m',
    }
  }

  return { property, latestValuation, yield: yieldStats, totalDebtCents, equityCents, lvrDecimal, totalAppreciationCents }
}
