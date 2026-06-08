export { computeReport, computeReturn } from './services/compute'
export type { ReportTotals, ReportFlags, PropertyTotals, MissingMortgage, InsightsReturn } from './services/compute'

export { fetchReturnData } from './repositories/return'

export { computePortfolioLVR } from './services/portfolio'
export type { PortfolioLVR } from './services/portfolio'

export { fetchTrendData, fetchPropertyTrendData } from './repositories/trends'
export type { TrendRow } from './repositories/trends'

export { fetchPortfolioData } from './repositories/portfolio'
export type { ValuationSnapshot, BalanceSnapshot } from './repositories/portfolio'

export {
  fetchPropertiesActiveInRange,
  fetchLoansActiveInRange,
  fetchLedgerEntriesInRange,
  fetchLedgerEntryForDelete,
  softDeleteLedgerEntry,
} from './repositories/ledger'

export { fetchPlanContext } from './plan/context'
export type { PlanContext, PlanContextProperty, PlanContextLoan } from './plan/context'
