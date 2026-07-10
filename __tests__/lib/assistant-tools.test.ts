import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
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

const entitiesFixture = [
  { id: 'entity-1', userId: USER_ID, name: 'Smith Family Trust', type: 'trust' as const, createdAt: new Date() },
  { id: 'entity-2', userId: USER_ID, name: 'Personal', type: 'individual' as const, createdAt: new Date() },
]

const propertyFixture = {
  id: PROP_ID, address: '1 Test St', nickname: 'Test', userId: USER_ID, startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date(), propertyType: null, purchasePriceCents: null, saleDate: null, salePriceCents: null, saleSettlementDate: null,
}

const activeAgentFixture = {
  id: 'agent-1', userId: USER_ID, propertyId: PROP_ID, agencyName: 'Ray White', contactName: 'Jane PM', phone: '0400 000 000', email: 'jane@raywhite.example', feePercent: null, statementCadence: 'monthly' as const, effectiveFrom: '2024-01-01', effectiveTo: null, createdAt: new Date(), deletedAt: null,
}

const LOAN_CREATED_AT = new Date('2020-01-01T00:00:00.000Z')

const loanFixture = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: LOAN_ID, userId: USER_ID, propertyId: PROP_ID, lender: 'ANZ', nickname: null, accountReference: 'SECRET-REF', startDate: '2020-01-01', endDate: null, entityId: null, loanType: null, ioEndDate: null, interestRate: '5.5', rateType: null, loanTermYears: 30, originalAmountCents: 50000000, createdAt: LOAN_CREATED_AT, latestBalance: null, recentBalances: [], ...overrides,
})

// ── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getPortfolioData: vi.fn(),
  getPropertyWithStats: vi.fn(),
  findPropertyById: vi.fn(),
  findActiveAgent: vi.fn(),
  findInstallmentLoanDetail: vi.fn(),
  findInstallmentLoanById: vi.fn(),
  listInstallmentLoans: vi.fn(),
  getCashflowSummary: vi.fn(),
  listLedgerEntriesInRange: vi.fn(),
  listEntities: vi.fn(),
}))

vi.mock('@/lib/aggregate', () => ({
  getPortfolioData: mocks.getPortfolioData,
  computePortfolioLVR: vi.fn().mockReturnValue({ totalValueCents: 0, totalDebtCents: 0, lvr: null, propertiesValued: 0, propertiesTotal: 0, loansWithBalance: 0, activeLoansTotal: 0 }),
  getCashflowSummary: mocks.getCashflowSummary,
  listLedgerEntriesInRange: mocks.listLedgerEntriesInRange,
}))

vi.mock('@/lib/property', () => ({
  getPropertyWithStats: mocks.getPropertyWithStats,
  findPropertyById: mocks.findPropertyById,
  findActiveAgent: mocks.findActiveAgent,
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanDetail: mocks.findInstallmentLoanDetail,
  findInstallmentLoanById: mocks.findInstallmentLoanById,
  listInstallmentLoans: mocks.listInstallmentLoans,
}))

vi.mock('@/lib/entities', () => ({
  listEntities: mocks.listEntities,
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
    mocks.listEntities.mockResolvedValue(entitiesFixture)
    mocks.findPropertyById.mockResolvedValue(propertyFixture)
    mocks.findActiveAgent.mockResolvedValue(activeAgentFixture)
    mocks.listInstallmentLoans.mockResolvedValue([loanFixture()])
    mocks.findInstallmentLoanById.mockResolvedValue(loanFixture())
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

    it('getPropertyLifecycleState schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.getPropertyLifecycleState.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('propertyId' in schema.shape).toBe(true)
    })

    it('buildActionChecklist schema has no userId field', () => {
      const tools = buildTools(USER_ID)
      const schema = tools.buildActionChecklist.inputSchema as z.ZodObject<z.ZodRawShape>
      expect('userId' in schema.shape).toBe(false)
      expect('steps' in schema.shape).toBe(true)
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

    it('getPropertyLifecycleState calls findPropertyById with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't6', messages: [], abortSignal: undefined })
      expect(mocks.findPropertyById).toHaveBeenCalledWith(USER_ID, PROP_ID)
      expect(mocks.findActiveAgent).toHaveBeenCalledWith(USER_ID, PROP_ID)
      expect(mocks.listInstallmentLoans).toHaveBeenCalledWith(USER_ID, PROP_ID)
    })

    it('buildActionChecklist calls findPropertyById and findInstallmentLoanById with closure userId', async () => {
      const tools = buildTools(USER_ID)
      await tools.buildActionChecklist.execute!({
        steps: [
          { type: 'ASSIGN_PROPERTY_MANAGER', propertyId: PROP_ID },
          { type: 'CLOSE_LOAN', loanId: LOAN_ID },
        ],
      }, { toolCallId: 't7', messages: [], abortSignal: undefined })
      expect(mocks.findPropertyById).toHaveBeenCalledWith(USER_ID, PROP_ID)
      expect(mocks.findInstallmentLoanById).toHaveBeenCalledWith(USER_ID, LOAN_ID)
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

    it('getPropertyLifecycleState strips accountReference from each loan', async () => {
      mocks.listInstallmentLoans.mockResolvedValue([loanFixture({ accountReference: 'SECRET-REF-9999' })])
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
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
      expect(result).not.toHaveProperty('source')
    })

    it('getLoanDetail returns found:false when loan does not exist', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: 'nonexistent' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.found).toBe(false)
      expect(result).not.toHaveProperty('source')
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

  describe('Test 7 — source field is a routable URL path, not a display label', () => {
    it('getPropertyDetail source is /properties/{id} when found', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyDetail.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.source).toBe(`/properties/${PROP_ID}`)
    })

    it('getLoanDetail source is /loans/{id} when found', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.source).toBe(`/loans/${LOAN_ID}`)
    })

    it('getPortfolioSummary source is /dashboard', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.source).toBe('/dashboard')
    })

    it('getCashflowByPeriod source is /dashboard', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.source).toBe('/dashboard')
    })

    it('lookupLedgerEntries source is /dashboard', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.source).toBe('/dashboard')
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
      expect(result.source).toBe(`/properties/${PROP_ID}`)
      expect(result).toHaveProperty('statusLabel')
    })

    it('getLoanDetail returns error payload when service throws', async () => {
      mocks.findInstallmentLoanDetail.mockRejectedValue(new Error('network error'))
      const tools = buildTools(USER_ID)
      const result = await tools.getLoanDetail.execute!({ loanId: LOAN_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result.source).toBe(`/loans/${LOAN_ID}`)
    })

    it('getCashflowByPeriod returns error payload when service throws', async () => {
      mocks.getCashflowSummary.mockRejectedValue(new Error('query failed'))
      const tools = buildTools(USER_ID)
      const result = await tools.getCashflowByPeriod.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result.source).toBe('/dashboard')
    })

    it('lookupLedgerEntries returns error payload when service throws', async () => {
      mocks.listLedgerEntriesInRange.mockRejectedValue(new Error('DB error'))
      const tools = buildTools(USER_ID)
      const result = await tools.lookupLedgerEntries.execute!({ from: '2026-01-01', to: '2026-03-31' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result.source).toBe('/dashboard')
    })

    it('getPropertyLifecycleState returns error payload when a downstream call throws', async () => {
      mocks.findPropertyById.mockRejectedValue(new Error('DB connection failed'))
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Unable to retrieve data. Please try again.')
      expect(JSON.stringify(result)).not.toContain('DB connection failed')
      expect(result.source).toBe(`/properties/${PROP_ID}`)
      expect(result).toHaveProperty('statusLabel')
    })

    it('buildActionChecklist isolates a downstream throw to a per-step error, not the whole batch', async () => {
      mocks.findPropertyById.mockRejectedValue(new Error('DB connection failed'))
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'ASSIGN_PROPERTY_MANAGER', propertyId: PROP_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.steps).toEqual([])
      expect(result.errors).toEqual([{ stepType: 'ASSIGN_PROPERTY_MANAGER', reason: 'Unable to resolve this step' }])
      expect(JSON.stringify(result)).not.toContain('DB connection failed')
    })
  })

  describe('Test 8 — getPortfolioSummary includes entities', () => {
    it('returns both entities alongside the existing return fields for a user with 2 entities', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.entities).toEqual(entitiesFixture)
      expect(result).toHaveProperty('properties')
      expect(result).toHaveProperty('loans')
      expect(mocks.listEntities).toHaveBeenCalledWith(USER_ID)
    })

    it('returns entities: [] for a user with zero entities, not an omitted field', async () => {
      mocks.listEntities.mockResolvedValue([])
      const tools = buildTools(USER_ID)
      const result = await tools.getPortfolioSummary.execute!({}, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toHaveProperty('entities')
      expect(result.entities).toEqual([])
    })
  })

  describe('Test 9 — getPropertyLifecycleState', () => {
    it('returns a trimmed active agent (id, agencyName only) and loans for a property with an active PM', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.found).toBe(true)
      expect(result.activeManagementAgent).toEqual({ id: activeAgentFixture.id, agencyName: activeAgentFixture.agencyName })
      const { accountReference: _accountReference, ...expectedLoan } = loanFixture()
      expect(result.loans).toEqual([expectedLoan])
      expect(result.source).toBe(`/properties/${PROP_ID}`)
      expect(result.label).toBe('Test')
    })

    it('does not leak PM contact details or tenant names — only id/agencyName reach the model', async () => {
      // Preconditions only ever check whether an active agent exists (see ASSIGN_PROPERTY_MANAGER's
      // whenToUse in catalog.ts) — contactName/phone/email and tenant identity are never needed.
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).not.toHaveProperty('tenancies')
      expect(result).not.toHaveProperty('managementAgents')
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('J. Doe')
      expect(serialized).not.toContain('contactName')
      expect(serialized).not.toContain('phone')
      expect(serialized).not.toContain('email')
    })

    it('returns activeManagementAgent: null when there is no active agent, regardless of lapsed history', async () => {
      mocks.findActiveAgent.mockResolvedValue(undefined)
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result.activeManagementAgent).toBeNull()
    })

    it('returns two loans, each carrying lender and endDate', async () => {
      const loans = [
        loanFixture({ id: 'loan-001', lender: 'ANZ', endDate: '2050-01-01' }),
        loanFixture({ id: 'loan-002', lender: 'Westpac', endDate: null }),
      ]
      mocks.listInstallmentLoans.mockResolvedValue(loans)
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: PROP_ID }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      const returnedLoans = result.loans as Array<Record<string, unknown>>
      expect(returnedLoans).toHaveLength(2)
      expect(returnedLoans[0]).toMatchObject({ lender: 'ANZ', endDate: '2050-01-01' })
      expect(returnedLoans[1]).toMatchObject({ lender: 'Westpac', endDate: null })
    })

    it('returns found: false and does not call downstream lookups for a non-owned or missing property', async () => {
      mocks.findPropertyById.mockResolvedValue(undefined)
      const tools = buildTools(USER_ID)
      const result = await tools.getPropertyLifecycleState.execute!({ propertyId: 'not-owned' }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>
      expect(result).toEqual({ found: false, statusLabel: expect.any(String) })
      expect(mocks.findActiveAgent).not.toHaveBeenCalled()
      expect(mocks.listInstallmentLoans).not.toHaveBeenCalled()
    })
  })

  describe('Test 10 — buildActionChecklist', () => {
    it('resolves CREATE_PROPERTY and ASSIGN_PROPERTY_MANAGER into two ordered steps with no errors', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [
          { type: 'CREATE_PROPERTY' },
          { type: 'ASSIGN_PROPERTY_MANAGER', propertyId: PROP_ID },
        ],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.errors).toBeUndefined()
      expect(result.steps).toEqual([
        { label: 'Add property', href: '/properties/new', order: 1 },
        { label: 'Assign property manager', href: `/properties/${PROP_ID}?tab=management`, order: 2 },
      ])
    })

    it('rejects an unknown step type into errors while still resolving the valid one, without throwing', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [
          { type: 'CREATE_PROPERTY' },
          { type: 'NOT_A_REAL_STEP' },
        ],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([{ label: 'Add property', href: '/properties/new', order: 1 }])
      expect(result.errors).toEqual([{ stepType: 'NOT_A_REAL_STEP', reason: expect.any(String) }])
    })

    it('rejects CLOSE_LOAN into errors when the loan is not owned by the user (cross-user isolation)', async () => {
      mocks.findInstallmentLoanById.mockResolvedValue(undefined)
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'CLOSE_LOAN', loanId: LOAN_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([])
      expect(result.errors).toEqual([{ stepType: 'CLOSE_LOAN', reason: expect.any(String) }])
    })

    it('rejects CREATE_LOAN, ASSIGN_PROPERTY_MANAGER, and MARK_PROPERTY_SOLD into errors when the propertyId is not owned by the user (cross-user isolation)', async () => {
      mocks.findPropertyById.mockResolvedValue(undefined)
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [
          { type: 'CREATE_LOAN', propertyId: PROP_ID },
          { type: 'ASSIGN_PROPERTY_MANAGER', propertyId: PROP_ID },
          { type: 'MARK_PROPERTY_SOLD', propertyId: PROP_ID },
        ],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([])
      const errors = result.errors as Array<Record<string, unknown>>
      expect(errors).toHaveLength(3)
      expect(errors.map((e) => e.stepType)).toEqual(['CREATE_LOAN', 'ASSIGN_PROPERTY_MANAGER', 'MARK_PROPERTY_SOLD'])
    })

    it('rejects CREATE_LOAN with no propertyId into errors, without fabricating a partially-resolved href', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'CREATE_LOAN' }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([])
      expect(result.errors).toEqual([{ stepType: 'CREATE_LOAN', reason: expect.any(String) }])
      expect(JSON.stringify(result)).not.toContain('propertyId=undefined')
      expect(mocks.findPropertyById).not.toHaveBeenCalled()
    })

    it('never includes a top-level source field (must not be picked up by CitationChips)', async () => {
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'CREATE_PROPERTY' }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result).not.toHaveProperty('source')
    })

    it('resolves CLOSE_LOAN when the loan has no endDate set', async () => {
      mocks.findInstallmentLoanById.mockResolvedValue(loanFixture({ endDate: null }))
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'CLOSE_LOAN', loanId: LOAN_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.errors).toBeUndefined()
      expect(result.steps).toEqual([{ label: 'Set loan end date', href: `/loans/${LOAN_ID}`, order: 1 }])
    })

    it('rejects CLOSE_LOAN into errors when the loan already has an endDate set (R11 state precondition, enforced structurally not just via prompt)', async () => {
      mocks.findInstallmentLoanById.mockResolvedValue(loanFixture({ endDate: '2055-05-26' }))
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'CLOSE_LOAN', loanId: LOAN_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([])
      expect(result.errors).toEqual([{ stepType: 'CLOSE_LOAN', reason: expect.any(String) }])
    })

    it('resolves MARK_PROPERTY_SOLD when the property has no saleDate set', async () => {
      mocks.findPropertyById.mockResolvedValue({ ...propertyFixture, saleDate: null })
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'MARK_PROPERTY_SOLD', propertyId: PROP_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.errors).toBeUndefined()
      expect(result.steps).toEqual([{ label: 'Mark as sold', href: `/properties/${PROP_ID}`, order: 1 }])
    })

    it('rejects MARK_PROPERTY_SOLD into errors when the property already has a saleDate set (R3 state precondition, enforced structurally not just via prompt)', async () => {
      mocks.findPropertyById.mockResolvedValue({ ...propertyFixture, saleDate: '2026-06-01' })
      const tools = buildTools(USER_ID)
      const result = await tools.buildActionChecklist.execute!({
        steps: [{ type: 'MARK_PROPERTY_SOLD', propertyId: PROP_ID }],
      }, { toolCallId: 't', messages: [], abortSignal: undefined }) as Record<string, unknown>

      expect(result.steps).toEqual([])
      expect(result.errors).toEqual([{ stepType: 'MARK_PROPERTY_SOLD', reason: expect.any(String) }])
    })
  })

  describe('Test 11 — structural audit: assistant tools ship no write-capable tool (AE3/R4/R9)', () => {
    it('no lib/assistant/tools/*.ts file references a write-repository function', () => {
      const WRITE_FUNCTION_NAMES = [
        'createEntity', 'updateEntity', 'deleteEntity',
        'createProperty', 'updateProperty', 'deleteProperty',
        'createInstallmentLoan', 'updateInstallmentLoan', 'updateInstallmentLoanById', 'endInstallmentLoan',
        'createTenancy', 'updateTenancy', 'deleteTenancy', 'addTenancy', 'editTenancy', 'removeTenancy',
        'createManagementAgent', 'updateManagementAgent', 'deleteManagementAgent',
        'addManagementAgent', 'editManagementAgent', 'removeManagementAgent',
        'createValuation', 'deleteValuation',
        'upsertLoanPaymentEntry', 'createLedgerEntry', 'createLoanLedgerEntry',
        'createInstallmentLoanBalance', 'deleteInstallmentLoanBalance',
      ]

      const toolsDir = path.join(process.cwd(), 'lib', 'assistant', 'tools')
      const files = fs.readdirSync(toolsDir).filter((file) => file.endsWith('.ts'))
      expect(files.length).toBeGreaterThan(0)

      for (const file of files) {
        const source = fs.readFileSync(path.join(toolsDir, file), 'utf-8')
        for (const fnName of WRITE_FUNCTION_NAMES) {
          expect(
            source.includes(fnName),
            `${file} references write-capable function "${fnName}" — assistant tools must never call write repositories`,
          ).toBe(false)
        }
      }
    })
  })
})
