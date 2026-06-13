import { findPropertyById } from '@/lib/property/repositories/properties'
import { findLoanIdsByProperty, findLatestBalancesByLoanIds } from '@/lib/borrowings'
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

  const [valuationRow, ledgerEntries, loanIds] = await Promise.all([
    findLatestValuation(userId, propertyId),
    findTrailing12mEntries(userId, propertyId),
    findLoanIdsByProperty(userId, propertyId),
  ])

  const latestValuation = valuationRow
    ? { valueCents: valuationRow.valueCents, valuedAt: valuationRow.valuedAt, source: valuationRow.source }
    : null

  let totalDebtCents = 0
  if (loanIds.length > 0) {
    const latestBalances = await findLatestBalancesByLoanIds(userId, loanIds)
    for (const b of latestBalances) {
      totalDebtCents += b.balanceCents
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
