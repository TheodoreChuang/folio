export { computeReport, computeReturn } from './services/compute'
export type { ReportTotals, ReportFlags, PropertyTotals, MissingMortgage, InsightsReturn } from './services/compute'

export { getReturnData } from './repositories/return'

export { computePortfolioLVR } from './services/portfolio'
export type { PortfolioLVR } from './services/portfolio'

export { listTrends, listPropertyTrends } from './repositories/trends'
export type { TrendRow } from './repositories/trends'

export { computeTrends } from './services/trends'
export type { TrendPoint } from './services/trends'

export { getPortfolioData } from './repositories/portfolio'
export type { ValuationSnapshot, BalanceSnapshot } from './repositories/portfolio'

export {
  listPropertiesActiveInRange,
  listLoansActiveInRange,
  listLedgerEntriesInRange,
  findLedgerEntryById,
  deleteLedgerEntry,
} from './repositories/ledger'

export { fetchPlanContext } from './plan/context'
export type { PlanContext, PlanContextProperty, PlanContextLoan } from './plan/context'

export { getCashflowSummary } from './services/cashflow'
