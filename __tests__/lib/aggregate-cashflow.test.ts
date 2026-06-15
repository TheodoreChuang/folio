import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCashflowSummary } from '@/lib/aggregate/services/cashflow'

const PROP_ID = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID = 'bbbb0001-0000-4000-b000-000000000001'
const USER_ID = 'user-123'

const propRow = {
  id: PROP_ID, userId: USER_ID, address: '1 Test St', nickname: null,
  startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date(),
  propertyType: null, purchasePriceCents: null, saleDate: null, salePriceCents: null, saleSettlementDate: null,
}
const loanRow = {
  id: LOAN_ID, userId: USER_ID, propertyId: PROP_ID, lender: 'Westpac',
  nickname: null, startDate: '2020-01-01', endDate: '2050-01-01', entityId: null, createdAt: new Date(),
  accountReference: null, loanType: null, ioEndDate: null, interestRate: null, rateType: null,
  loanTermYears: null, originalAmountCents: null,
}
const rentEntry = {
  id: 'entry-001', userId: USER_ID, propertyId: PROP_ID, sourceDocumentId: null,
  installmentLoanId: null, lineItemDate: '2026-03-15', amountCents: 200000,
  category: 'rent' as const, description: null, userNotes: null,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}

const mocks = vi.hoisted(() => ({
  listPropertiesActiveInRange: vi.fn(),
  listLoansActiveInRange: vi.fn(),
  listLedgerEntriesInRange: vi.fn(),
}))

vi.mock('@/lib/aggregate/repositories/ledger', () => ({
  listPropertiesActiveInRange: mocks.listPropertiesActiveInRange,
  listLoansActiveInRange: mocks.listLoansActiveInRange,
  listLedgerEntriesInRange: mocks.listLedgerEntriesInRange,
}))

describe('getCashflowSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPropertiesActiveInRange.mockResolvedValue([propRow])
    mocks.listLoansActiveInRange.mockResolvedValue([loanRow])
    mocks.listLedgerEntriesInRange.mockResolvedValue([rentEntry])
  })

  it('returns totals and flags from computeReport', async () => {
    const result = await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    expect(result).toHaveProperty('totals')
    expect(result).toHaveProperty('flags')
    expect(result.totals.totalRent).toBe(200000)
    expect(result.totals.propertyCount).toBe(1)
  })

  it('passes userId to all repo calls', async () => {
    await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    expect(mocks.listPropertiesActiveInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', undefined, undefined)
    expect(mocks.listLoansActiveInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', undefined)
  })

  it('passes filteredPropertyIds when props are found (no filter)', async () => {
    await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    // props returned [propRow], no filter applied → passes [PROP_ID]
    expect(mocks.listLedgerEntriesInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', [PROP_ID])
  })

  it('passes undefined for propertyIds when no filter and no props found', async () => {
    mocks.listPropertiesActiveInRange.mockResolvedValue([])
    await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    // hasFilter = false, filteredPropertyIds = [] → passes undefined (all user properties)
    expect(mocks.listLedgerEntriesInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', undefined)
  })

  it('passes [] for propertyIds when filter applied but no matching props found', async () => {
    mocks.listPropertiesActiveInRange.mockResolvedValue([])
    await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31', { propertyId: 'other-prop-id' })
    // hasFilter = true, filteredPropertyIds = [] → passes [] (no entries)
    expect(mocks.listLedgerEntriesInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', [])
  })

  it('passes propertyId and entityId filter options to property repo', async () => {
    await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31', { propertyId: PROP_ID, entityId: 'entity-1' })
    expect(mocks.listPropertiesActiveInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', PROP_ID, 'entity-1')
    expect(mocks.listLoansActiveInRange).toHaveBeenCalledWith(USER_ID, '2026-03-01', '2026-03-31', 'entity-1')
  })

  it('returns zero totals when no entries exist', async () => {
    mocks.listPropertiesActiveInRange.mockResolvedValue([propRow])
    mocks.listLoansActiveInRange.mockResolvedValue([])
    mocks.listLedgerEntriesInRange.mockResolvedValue([])
    const result = await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    expect(result.totals.totalRent).toBe(0)
    expect(result.totals.netAfterMortgage).toBe(0)
  })

  it('returns empty totals cleanly when no properties exist', async () => {
    mocks.listPropertiesActiveInRange.mockResolvedValue([])
    mocks.listLoansActiveInRange.mockResolvedValue([])
    mocks.listLedgerEntriesInRange.mockResolvedValue([])
    const result = await getCashflowSummary(USER_ID, '2026-03-01', '2026-03-31')
    expect(result.totals.propertyCount).toBe(0)
    expect(result.flags.missingStatements).toHaveLength(0)
    expect(result.flags.missingMortgages).toHaveLength(0)
  })
})
