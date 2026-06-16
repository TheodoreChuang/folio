import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { buildTools } from '@/lib/assistant/tools/index'

const USER_ID = 'user-abc'
const OTHER_USER_ID = 'user-xyz'
const PROP_ID = 'prop-001'
const LOAN_ID = 'loan-001'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const portfolioData = {
  properties: [],
  valuations: [],
  balances: [],
  loans: [],
}

const propertyWithStats = {
  property: { id: PROP_ID, address: '1 Test St', nickname: 'Test', userId: USER_ID, startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date(), propertyType: null, purchasePriceCents: null, saleDate: null, salePriceCents: null, saleSettlementDate: null },
  latestValuation: null,
  yield: null,
  totalDebtCents: 0,
  equityCents: null,
  lvrDecimal: null,
  totalAppreciationCents: null,
}

const loanDetail = {
  id: LOAN_ID,
  userId: USER_ID,
  propertyId: PROP_ID,
  lender: 'ANZ',
  nickname: null,
  accountReference: 'SECRET-REF-12345',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  entityId: null,
  loanType: null,
  ioEndDate: null,
  interestRate: '5.5',
  rateType: null,
  loanTermYears: 30,
  originalAmountCents: 50000000,
  createdAt: new Date(),
  propertyAddress: '1 Test St',
  entityName: null,
  latestBalance: { balanceCents: 48000000, recordedAt: '2026-06-01' },
}

const cashflowResult = {
  totals: { totalRent: 0, totalOtherIncome: 0, totalExpenses: 0, totalMortgage: 0, netBeforeMortgage: 0, netAfterMortgage: 0, statementsReceived: 0, mortgagesProvided: 0, propertyCount: 0, properties: [] },
  flags: { missingStatements: [], missingMortgages: [] },
}

const ledgerEntries = [
  { id: 'entry-1', userId: USER_ID, propertyId: PROP_ID, sourceDocumentId: null, installmentLoanId: null, lineItemDate: '2026-03-15', amountCents: 200000, category: 'rent' as const, description: null, userNotes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
]

// ── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getPortfolioData: vi.fn(),
  getPropertyWithStats: vi.fn(),
  findInstallmentLoanDetail: vi.fn(),
  getCashflowSummary: vi.fn(),
  listLedgerEntriesInRange: vi.fn(),
}))

vi.mock('@/lib/aggregate', () => ({
  getPortfolioData: mocks.getPortfolioData,
  computePortfolioLVR: vi.fn().mockReturnValue({ totalValueCents: 0, totalDebtCents: 0, lvr: null, propertiesValued: 0, propertiesTotal: 0, loansWithBalance: 0, activeLoansTotal: 0 }),
  getCashflowSummary: mocks.getCashflowSummary,
  listLedgerEntriesInRange: mocks.listLedgerEntriesInRange,
}))

vi.mock('@/lib/property', () => ({
  getPropertyWithStats: mocks.getPropertyWithStats,
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanDetail: mocks.findInstallmentLoanDetail,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPortfolioData.mockResolvedValue(portfolioData)
    mocks.getPropertyWithStats.mockResolvedValue(propertyWithStats)
    mocks.findInstallmentLoanDetail.mockResolvedValue(loanDetail)
    mocks.getCashflowSummary.mockResolvedValue(cashflowResult)
    mocks.listLedgerEntriesInRange.mockResolvedValue(ledgerEntries)
  })

  describe('Test 1 — no userId in any tool\'s model-facing input schema', () => {
    it('getPortfolioSummary schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.getPortfolioSummary.inputSchema
      expect(schema instanceof z.ZodObject ? 'userId' in schema.shape : false).toBe(false)
    })

    it('getPropertyDetail schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.getPropertyDetail.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('propertyId' in schema.shape).toBe(true)
    })

    it('getLoanDetail schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.getLoanDetail.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('loanId' in schema.shape).toBe(true)
    })

    it('getCashflowByPeriod schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.getCashflowByPeriod.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('from' in schema.shape).toBe(true)
      expect('to' in schema.shape).toBe(true)
    })

    it('lookupLedgerEntries schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.lookupLedgerEntries.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('from' in schema.shape).toBe(true)
      expect('to' in schema.shape).toBe(true)
    })
  })

  describe('Test 2 — buildTools(userId) invokes underlying service with that exact userId', () => {
    it('getPortfolioSummary calls getPortfolioData with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.getPortfolioSummary.execute!({}, { toolCallId: 't1', messages: [], abortSignal: undefined })
      expect(mocks.getPortfolioData).toHaveBeenCalledWith(USER_ID)
      expect(mocks.getPortfolioData).not.toHaveBeenCalledWith(OTHER_USER_ID)
    })

    it('getPropertyDetail calls getPropertyWithStats with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.getPropertyDetail.execute!({ propertyId: PROP_ID }, { toolCallId: 't2', messages: [], abortSignal: undefined })
      expect(mocks.getPropertyWithStats).toHaveBeenCalledWith(USER_ID, PROP_ID)
    })

    it('getLoanDetail calls findInstallmentLoanDetail with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't3', messages: [], abortSignal: undefined })
      expect(mocks.findInstallmentLoanDetail).toHaveBeenCalledWith(USER_ID, LOAN_ID)
    })

    it('getCashflowByPeriod calls getCashflowSummary with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't4', messages: [], abortSignal: undefined })
      expect(mocks.getCashflowSummary).toHaveBeenCalledWith(USER_ID, '2026-01-01', '2026-03-31', { propertyId: undefined, entityId: undefined })
    })

    it('lookupLedgerEntries calls listLedgerEntriesInRange with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't5', messages: [], abortSignal: undefined })
      expect(mocks.listLedgerEntriesInRange).toHaveBeenCalledWith(USER_ID, '2026-01-01', '2026-03-31', undefined, undefined)
    })

    it('uses the userId from the specific buildTools call, not a shared global', async () => {
      const toolsA = buildTools(USER_ID)
      const toolsB = buildTools(OTHER_USER_ID)
      await toolsA.getPortfolioSummary.execute!({}, { toolCallId: 'tA', messages: [], abortSignal: undefined })
      await toolsB.getPortfolioSummary.execute!({}, { toolCallId: 'tB', messages: [], abortSignal: undefined })
      expect(mocks.getPortfolioData).toHaveBeenNthCalledWith(1, USER_ID)
      expect(mocks.getPortfolioData).toHaveBeenNthCalledWith(2, OTHER_USER_ID)
    })
  })

  describe('Test 3 — accountReference is never present in tool output', () => {
    it('getLoanDetail strips accountReference from the output', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't', messages: [], abortSignal: undefined })
      // Top-level result
      expect(result).not.toHaveProperty('accountReference')
      // Nested loan object (where the data actually lives)
      if ('loan' in result && result.loan) {
        expect(result.loan).not.toHaveProperty('accountReference')
      }
    })

    it('getLoanDetail accountReference key is absent when loan is not found', async () => {
      mocks.findInstallmentLoanDetail.mockResolvedValue(undefined)
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: 'nonexistent' }, { toolCallId: 't', messages: [], abortSignal: undefined })
      expect(result).not.toHaveProperty('accountReference')
    })

    it('getPortfolioSummary strips accountReference from each loan in the portfolio', async () => {
      mocks.getPortfolioData.mockResolvedValue({
        ...portfolioData,
        loans: [{ id: LOAN_ID, userId: USER_ID, propertyId: PROP_ID, lender: 'ANZ', nickname: null, accountReference: 'SECRET-ACCOUNT-0123', startDate: '2020-01-01', endDate: '2050-01-01', entityId: null, loanType: null, ioEndDate: null, interestRate: '5.5', rateType: null, loanTermYears: 30, originalAmountCents: 50000000, createdAt: new Date(), updatedAt: new Date(), deletedAt: null }],
      })
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).not.toHaveProperty('accountReference')
      const loans = result.loans as Array<Record<string, unknown>>
      expect(loans).toHaveLength(1)
      expect(loans[0]).not.toHaveProperty('accountReference')
    })
  })

  describe('Test 4 — each tool returns non-empty source and statusLabel (not the function name)', () => {
    const TOOL_FUNCTION_NAMES = ['buildPortfolioTool', 'buildPropertyTool', 'buildLoanTool', 'buildCashflowTool', 'buildLedgerTool', 'buildTools', 'getPortfolioSummary', 'getPropertyDetail', 'getLoanDetail', 'getCashflowByPeriod', 'lookupLedgerEntries']

    it('getPortfolioSummary returns source and statusLabel', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(typeof result.source).toBe('string')
      expect((result.source as string).length).toBeGreaterThan(0)
      expect(typeof result.statusLabel).toBe('string')
      expect((result.statusLabel as string).length).toBeGreaterThan(0)
      expect(TOOL_FUNCTION_NAMES).not.toContain(result.statusLabel)
    })

    it('getPropertyDetail returns source and statusLabel', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyDetail.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(typeof result.source).toBe('string')
      expect((result.source as string).length).toBeGreaterThan(0)
      expect(TOOL_FUNCTION_NAMES).not.toContain(result.statusLabel)
    })

    it('getLoanDetail returns source and statusLabel', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(typeof result.source).toBe('string')
      expect((result.source as string).length).toBeGreaterThan(0)
      expect(TOOL_FUNCTION_NAMES).not.toContain(result.statusLabel)
    })

    it('getCashflowByPeriod returns source and statusLabel', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(typeof result.source).toBe('string')
      expect((result.source as string).length).toBeGreaterThan(0)
      expect(TOOL_FUNCTION_NAMES).not.toContain(result.statusLabel)
    })

    it('lookupLedgerEntries returns source and statusLabel', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(typeof result.source).toBe('string')
      expect((result.source as string).length).toBeGreaterThan(0)
      expect(TOOL_FUNCTION_NAMES).not.toContain(result.statusLabel)
    })
  })

  describe('Test 5 — empty-portfolio user: tools return empty/zero results without throwing', () => {
    beforeEach(() => {
      mocks.getPortfolioData.mockResolvedValue({ properties: [], valuations: [], balances: [], loans: [] })
      mocks.getPropertyWithStats.mockResolvedValue(null)
      mocks.findInstallmentLoanDetail.mockResolvedValue(undefined)
      mocks.getCashflowSummary.mockResolvedValue({ totals: { ...cashflowResult.totals, propertyCount: 0 }, flags: { missingStatements: [], missingMortgages: [] } })
      mocks.listLedgerEntriesInRange.mockResolvedValue([])
    })

    it('getPortfolioSummary does not throw for empty portfolio', async () => {
      const tools = buildTools(USER_ID)
      await expect(tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined })).resolves.toBeDefined()
    })

    it('getPropertyDetail returns found:false when property does not exist', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyDetail.execute!({ propertyId: 'nonexistent' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.found).toBe(false)
    })

    it('getLoanDetail returns found:false when loan does not exist', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: 'nonexistent' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.found).toBe(false)
    })

    it('getCashflowByPeriod returns zero totals without throwing', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).not.toHaveProperty('error')
      const totals = result.totals as Record<string, number>
      expect(totals.propertyCount).toBe(0)
    })

    it('lookupLedgerEntries returns empty entries without throwing', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).not.toHaveProperty('error')
      expect(result.count).toBe(0)
    })
  })

  describe('Test 6 — service throws → structured error payload, not unhandled rejection', () => {
    it('getPortfolioSummary returns error payload when service throws', async () => {
      mocks.getPortfolioData.mockRejectedValue(new Error('DB connection failed'))
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Unable to retrieve data. Please try again.')
      expect(result).toHaveProperty('source')
      expect(result).toHaveProperty('statusLabel')
    })

    it('getPropertyDetail returns error payload when service throws', async () => {
      mocks.getPropertyWithStats.mockRejectedValue(new Error('timeout'))
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyDetail.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('source')
      expect(result).toHaveProperty('statusLabel')
    })

    it('getLoanDetail returns error payload when service throws', async () => {
      mocks.findInstallmentLoanDetail.mockRejectedValue(new Error('network error'))
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('source')
    })

    it('getCashflowByPeriod returns error payload when service throws', async () => {
      mocks.getCashflowSummary.mockRejectedValue(new Error('query failed'))
      const tools = buildTools(USER_ID)
      const result = await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('source')
    })

    it('lookupLedgerEntries returns error payload when service throws', async () => {
      mocks.listLedgerEntriesInRange.mockRejectedValue(new Error('DB error'))
      const tools = buildTools(USER_ID)
      const result = await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('source')
    })
  })
})
