import { buildPortfolioTool } from './portfolio'
import { buildPropertyTool } from './property'
import { buildLoanTool } from './loan'
import { buildCashflowTool } from './cashflow'
import { buildLedgerTool } from './ledger'

export function buildTools(userId: string) {
  return {
    getPortfolioSummary: buildPortfolioTool(userId),
    getPropertyDetail: buildPropertyTool(userId),
    getLoanDetail: buildLoanTool(userId),
    getCashflowByPeriod: buildCashflowTool(userId),
    lookupLedgerEntries: buildLedgerTool(userId),
  }
}
