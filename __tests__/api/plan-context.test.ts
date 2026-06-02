import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/plan/context/route'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchPortfolioData: vi.fn(),
  mockFetchLedgerEntriesInRange: vi.fn(),
  mockListBudgetItems: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } }),
  ),
}))

vi.mock('@/lib/aggregate/repositories/portfolio', () => ({
  fetchPortfolioData: mocks.mockFetchPortfolioData,
}))

vi.mock('@/lib/aggregate/repositories/ledger', () => ({
  fetchLedgerEntriesInRange: mocks.mockFetchLedgerEntriesInRange,
}))

vi.mock('@/lib/household/repositories/budget-items', () => ({
  listBudgetItems: mocks.mockListBudgetItems,
}))

// ── Factories ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc-0000'

function makeProperty(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-0001',
    userId: USER_ID,
    address: '1 Test St Sydney NSW 2000',
    nickname: null,
    startDate: '2020-01-01',
    endDate: null,
    entityId: null,
    createdAt: new Date(),
    propertyType: null,
    purchasePriceCents: null,
    saleDate: null,
    salePriceCents: null,
    saleSettlementDate: null,
    ...overrides,
  }
}

function makeLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-0001',
    userId: USER_ID,
    propertyId: 'prop-0001',
    lender: 'ANZ',
    nickname: null,
    accountReference: null,
    startDate: '2020-01-01',
    endDate: null,
    entityId: null,
    loanType: 'principal_and_interest' as const,
    ioEndDate: null,
    interestRate: '5.50',
    rateType: 'variable' as const,
    loanTermYears: 30,
    originalAmountCents: 50000000,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeLedgerEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-0001',
    userId: USER_ID,
    propertyId: 'prop-0001',
    lineItemDate: '2026-03-15',
    amountCents: 200000,
    category: 'rent' as const,
    sourceDocumentId: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

function makeBudgetItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'budget-0001',
    userId: USER_ID,
    type: 'income' as const,
    name: 'Salary',
    amountCents: 1000000,
    frequency: 'monthly' as const,
    effectiveFrom: null,
    detail: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

const emptyPortfolio = { properties: [], valuations: [], balances: [], loans: [] }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/plan/context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.mockFetchPortfolioData.mockResolvedValue(emptyPortfolio)
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([])
    mocks.mockListBudgetItems.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns context wrapped in { context } shape', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('context')
    expect(body.context).toHaveProperty('counts')
    expect(body.context).toHaveProperty('properties')
    expect(body.context).toHaveProperty('loans')
  })

  // ── counts.variableLoans ───────────────────────────────────────────────────

  it('returns counts.variableLoans = 0 when no variable loans exist', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      ...emptyPortfolio,
      loans: [makeLoan({ rateType: 'fixed' })],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.counts.variableLoans).toBe(0)
  })

  it('returns counts.variableLoans = 2 when 2 loans have rateType = variable', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      ...emptyPortfolio,
      loans: [
        makeLoan({ id: 'loan-a', rateType: 'variable' }),
        makeLoan({ id: 'loan-b', rateType: 'variable' }),
        makeLoan({ id: 'loan-c', rateType: 'fixed' }),
      ],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.counts.variableLoans).toBe(2)
  })

  it('counts line_of_credit loans as variable', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      ...emptyPortfolio,
      loans: [
        makeLoan({ id: 'loan-a', loanType: 'line_of_credit', rateType: 'variable' }),
        makeLoan({ id: 'loan-b', loanType: 'line_of_credit', rateType: null }),
      ],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.counts.variableLoans).toBe(2)
  })

  // ── counts.ioLoans ────────────────────────────────────────────────────────

  it('counts only IO loans where ioEndDate is not null', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      ...emptyPortfolio,
      loans: [
        makeLoan({ id: 'loan-a', loanType: 'interest_only', ioEndDate: '2027-06-01' }),
        makeLoan({ id: 'loan-b', loanType: 'interest_only', ioEndDate: null }),
        makeLoan({ id: 'loan-c', loanType: 'principal_and_interest', ioEndDate: null }),
      ],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.counts.ioLoans).toBe(1)
  })

  // ── latest valuation / balance ────────────────────────────────────────────

  it('returns latestValuation = null for a property with no valuations', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.properties[0].latestValuation).toBeNull()
  })

  it('returns the most recent valuation for a property', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [
        { propertyId: 'prop-0001', valueCents: 80000000, valuedAt: '2026-01-01' },
        { propertyId: 'prop-0001', valueCents: 75000000, valuedAt: '2025-01-01' },
      ],
      balances: [],
      loans: [],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.properties[0].latestValuation).toEqual({
      valueCents: 80000000,
      valuedAt: '2026-01-01',
    })
  })

  it('returns latestBalance = null for a loan with no balances', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [makeLoan()],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.loans[0].latestBalance).toBeNull()
  })

  it('returns the most recent balance for a loan', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [
        { installmentLoanId: 'loan-0001', balanceCents: 45000000, recordedAt: '2026-01-01' },
        { installmentLoanId: 'loan-0001', balanceCents: 46000000, recordedAt: '2025-01-01' },
      ],
      loans: [makeLoan()],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.loans[0].latestBalance).toEqual({
      balanceCents: 45000000,
      recordedAt: '2026-01-01',
    })
  })

  // ── household surplus ─────────────────────────────────────────────────────

  it('returns householdSurplusMonthlyCents = null when no budget items', async () => {
    mocks.mockListBudgetItems.mockResolvedValue([])
    const res = await GET()
    const { context } = await res.json()
    expect(context.householdSurplusMonthlyCents).toBeNull()
  })

  it('returns computed surplus when budget items exist', async () => {
    mocks.mockListBudgetItems.mockResolvedValue([
      makeBudgetItem({ type: 'income', amountCents: 1000000, frequency: 'monthly' }),
      makeBudgetItem({ id: 'budget-0002', type: 'expense', amountCents: 300000, frequency: 'monthly' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    expect(context.householdSurplusMonthlyCents).toBe(700000)
  })

  // ── portfolio baseline ────────────────────────────────────────────────────

  it('returns portfolioBaseline = null when no ledger entries exist', async () => {
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([])
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline).toBeNull()
  })

  it('returns rentMonthlyCents as a 3-month average when ledger data exists', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    // 3 rent entries × $2,000 = $6,000 total → avg $2,000/month
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', lineItemDate: '2026-03-10', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e2', lineItemDate: '2026-04-10', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e3', lineItemDate: '2026-05-10', amountCents: 200000, category: 'rent' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline).not.toBeNull()
    expect(context.portfolioBaseline.rentMonthlyCents).toBe(200000)
  })

  it('returns expensesMonthlyCents and loanRepaymentsMonthlyCents averaged over 3 months', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', amountCents: 300000, category: 'insurance' }),
      makeLedgerEntry({ id: 'e2', amountCents: 300000, category: 'rates' }),
      makeLedgerEntry({ id: 'e3', amountCents: 150000, category: 'loan_payment' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    // expenses: 600000 total / 3 = 200000
    // mortgage: 150000 total / 3 = 50000
    expect(context.portfolioBaseline.expensesMonthlyCents).toBe(200000)
    expect(context.portfolioBaseline.loanRepaymentsMonthlyCents).toBe(50000)
  })

  // ── active filters ────────────────────────────────────────────────────────

  it('excludes properties where endDate is before today', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [
        makeProperty({ id: 'prop-active', endDate: null }),
        makeProperty({ id: 'prop-ended', endDate: '2020-06-01' }),
      ],
      valuations: [],
      balances: [],
      loans: [],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.properties).toHaveLength(1)
    expect(context.properties[0].id).toBe('prop-active')
    expect(context.counts.properties).toBe(1)
  })

  it('excludes loans where endDate is before today', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [
        makeLoan({ id: 'loan-active', endDate: null, rateType: 'variable' }),
        makeLoan({ id: 'loan-ended', endDate: '2020-06-01', rateType: 'variable' }),
      ],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.loans).toHaveLength(1)
    expect(context.loans[0].id).toBe('loan-active')
    // ended loan should not count toward variableLoans
    expect(context.counts.variableLoans).toBe(1)
  })
})
