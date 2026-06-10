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

  it('passes the authenticated user id to all data-fetching repositories', async () => {
    await GET()
    expect(mocks.mockFetchPortfolioData).toHaveBeenCalledWith(USER_ID)
    expect(mocks.mockListBudgetItems).toHaveBeenCalledWith(USER_ID)
    expect(mocks.mockFetchLedgerEntriesInRange).toHaveBeenCalledWith(USER_ID, expect.any(String), expect.any(String))
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

  it('returns purchasePriceCents on properties', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty({ purchasePriceCents: 75000000 })],
      valuations: [],
      balances: [],
      loans: [],
    })
    const res = await GET()
    const { context } = await res.json()
    expect(context.properties[0].purchasePriceCents).toBe(75000000)
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

  it('returns portfolioBaseline = null when no ledger entries exist in the trailing 12-month window', async () => {
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

  it('fetches ledger entries over a trailing 12-month window', async () => {
    // Pin to a known date so from/to are deterministic regardless of when the test runs.
    // 2026-06-03T12:00:00Z = June 3 AEST (UTC+10 in winter) — same calendar date in both UTC and AEST.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))
    try {
      const res = await GET()
      expect(res.status).toBe(200)
      const [[, from, to]] = mocks.mockFetchLedgerEntriesInRange.mock.calls
      expect(from).toBe('2025-06-01') // first day of month 12 months before June 2026
      expect(to).toBe('2026-05-31')   // last day of the month before current
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns portfolioBaseline when ledger data spans less than 12 months (divides by actual span)', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    // 3 months of rent data (Mar–May): 3 × $2,000 = $6,000 total → $2,000/month (span = 3)
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', lineItemDate: '2026-03-10', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e2', lineItemDate: '2026-04-10', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e3', lineItemDate: '2026-05-10', amountCents: 200000, category: 'rent' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline).not.toBeNull()
    expect(context.portfolioBaseline.rentMonthlyCents).toBe(200000) // 600000 / 3
  })

  it('counts gap months in the span (calendar span, not distinct months)', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    // Entries in Jan and Mar only — Feb has no entries. Calendar span = 3 (Jan–Mar).
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', lineItemDate: '2026-01-15', amountCents: 300000, category: 'rent' }),
      makeLedgerEntry({ id: 'e2', lineItemDate: '2026-03-15', amountCents: 300000, category: 'rent' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline.rentMonthlyCents).toBe(200000) // 600000 / 3
  })

  it('returns correct monthly averages when ledger data spans a full 12 months', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    // 12 monthly rent entries × $2,000 = $24,000 total → $2,000/month
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        makeLedgerEntry({
          id: `e${i + 1}`,
          lineItemDate: `2025-${String(i + 1).padStart(2, '0')}-15`,
          amountCents: 200000,
          category: 'rent',
        }),
      ),
    )
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline).not.toBeNull()
    expect(context.portfolioBaseline.rentMonthlyCents).toBe(200000) // 2400000 / 12
  })

  it('averages expensesMonthlyCents and loanRepaymentsMonthlyCents by calendar span', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [],
      loans: [],
    })
    // Entries spread across 3 months (Mar–May) → span = 3
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', lineItemDate: '2026-03-15', amountCents: 300000, category: 'insurance' }),
      makeLedgerEntry({ id: 'e2', lineItemDate: '2026-04-15', amountCents: 300000, category: 'rates' }),
      makeLedgerEntry({ id: 'e3', lineItemDate: '2026-05-15', amountCents: 150000, category: 'loan_payment' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    // expenses: 600000 / 3 = 200000
    // mortgage: 150000 / 3 = 50000
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

  it('includes a property whose endDate is exactly today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z')) // June 3 in both UTC and AEST
    try {
      mocks.mockFetchPortfolioData.mockResolvedValue({
        properties: [makeProperty({ endDate: '2026-06-03' })],
        valuations: [],
        balances: [],
        loans: [],
      })
      const res = await GET()
      const { context } = await res.json()
      expect(context.properties).toHaveLength(1)
      expect(context.counts.properties).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('includes a loan whose endDate is exactly today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))
    try {
      mocks.mockFetchPortfolioData.mockResolvedValue({
        properties: [makeProperty()],
        valuations: [],
        balances: [],
        loans: [makeLoan({ endDate: '2026-06-03', rateType: 'variable' })],
      })
      const res = await GET()
      const { context } = await res.json()
      expect(context.loans).toHaveLength(1)
      expect(context.counts.variableLoans).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the most recent valuation even when valuations arrive in ascending date order', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [
        { propertyId: 'prop-0001', valueCents: 75000000, valuedAt: '2025-01-01' }, // older, first
        { propertyId: 'prop-0001', valueCents: 80000000, valuedAt: '2026-01-01' }, // newer, second
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

  it('returns the most recent loan balance even when balances arrive in ascending date order', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [makeProperty()],
      valuations: [],
      balances: [
        { installmentLoanId: 'loan-0001', balanceCents: 46000000, recordedAt: '2025-01-01' }, // older, first
        { installmentLoanId: 'loan-0001', balanceCents: 45000000, recordedAt: '2026-01-01' }, // newer, second
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

  it('uses local calendar date (not UTC) for the ledger date range', async () => {
    // 2026-06-03T14:30:00Z = 2026-06-04T00:30:00+10:00 AEST
    // Local date is June 4; UTC date is June 3.
    // Buggy toISOString produces 2025-05-31 (from) and 2026-05-30 (to).
    // Fixed formatLocalDate produces 2025-06-01 (from) and 2026-05-31 (to).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-03T14:30:00.000Z'))
    try {
      await GET()
      const [[, from, to]] = mocks.mockFetchLedgerEntriesInRange.mock.calls
      expect(from).toBe('2025-06-01')
      expect(to).toBe('2026-05-31')
    } finally {
      vi.useRealTimers()
    }
  })

  it('excludes inactive-property entries from monthSpan and portfolioBaseline totals', async () => {
    // Active property: 3 entries in Jan–Mar 2026 (span = 3 months), $600k total rent
    // Inactive property: 1 entry in Jan 2025 (would extend span to 15 months if included)
    // Expected: rentMonthlyCents = 600000 / 3 = 200000 (not 600000 / 15 = 40000)
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [
        makeProperty({ id: 'prop-active', endDate: null }),
        makeProperty({ id: 'prop-inactive', endDate: '2020-01-01' }),
      ],
      valuations: [],
      balances: [],
      loans: [],
    })
    mocks.mockFetchLedgerEntriesInRange.mockResolvedValue([
      makeLedgerEntry({ id: 'e1', propertyId: 'prop-active', lineItemDate: '2026-01-15', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e2', propertyId: 'prop-active', lineItemDate: '2026-02-15', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e3', propertyId: 'prop-active', lineItemDate: '2026-03-15', amountCents: 200000, category: 'rent' }),
      makeLedgerEntry({ id: 'e4', propertyId: 'prop-inactive', lineItemDate: '2025-01-15', amountCents: 999999, category: 'rent' }),
    ])
    const res = await GET()
    const { context } = await res.json()
    expect(context.portfolioBaseline).not.toBeNull()
    expect(context.portfolioBaseline.rentMonthlyCents).toBe(200000) // 600000 / 3, not / 15
  })
})
