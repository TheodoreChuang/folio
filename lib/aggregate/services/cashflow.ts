import {
  listPropertiesActiveInRange,
  listLoansActiveInRange,
  listLedgerEntriesInRange,
} from '../repositories/ledger'
import { computeReport } from './compute'
import type { ReportTotals, ReportFlags } from './compute'

// Fetch+compute service extracted from the inline orchestration in app/api/v1/ledger/summary/route.ts
export async function getCashflowSummary(
  userId: string,
  from: string,
  to: string,
  options?: { propertyId?: string; entityId?: string },
): Promise<{ totals: ReportTotals; flags: ReportFlags }> {
  const propertyId = options?.propertyId
  const entityId = options?.entityId

  const [props, loans] = await Promise.all([
    listPropertiesActiveInRange(userId, from, to, propertyId, entityId),
    listLoansActiveInRange(userId, from, to, entityId),
  ])

  const filteredPropertyIds = props.map(p => p.id)
  const hasFilter = !!(propertyId || entityId)
  const entries = await listLedgerEntriesInRange(
    userId,
    from,
    to,
    filteredPropertyIds.length > 0 ? filteredPropertyIds : (hasFilter ? [] : undefined),
  )

  return computeReport(entries, props, loans)
}
