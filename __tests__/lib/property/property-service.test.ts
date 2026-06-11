import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPropertyWithStats } from '@/lib/property/services/property'

const mocks = vi.hoisted(() => ({
  mockFindById:                   vi.fn(),
  mockFindLatestValuation:        vi.fn(),
  mockFindTrailing12m:            vi.fn(),
  mockFindLoanIdsByProperty:      vi.fn(),
  mockFindLatestBalancesByLoanIds: vi.fn(),
}))

vi.mock('@/lib/property/repositories/properties', () => ({
  findPropertyById: mocks.mockFindById,
}))

vi.mock('@/lib/property/repositories/valuations', () => ({
  findLatestValuation: mocks.mockFindLatestValuation,
}))

vi.mock('@/lib/property/repositories/ledger', () => ({
  findTrailing12mEntries: mocks.mockFindTrailing12m,
}))

vi.mock('@/lib/borrowings', () => ({
  findLoanIdsByProperty:       mocks.mockFindLoanIdsByProperty,
  findLatestBalancesByLoanIds: mocks.mockFindLatestBalancesByLoanIds,
}))

const PROP_ID = 'prop-1111-2222-3333-4444-555555555555'
const USER_ID = 'user-aaa'

const prop = {
  id: PROP_ID,
  userId: USER_ID,
  address: '1 Main St',
  nickname: null,
  startDate: '2020-01-01',
  endDate: null,
  entityId: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mockFindLoanIdsByProperty.mockResolvedValue([])
})

describe('getPropertyWithStats', () => {
  it('returns null when property not found', async () => {
    mocks.mockFindById.mockResolvedValue(undefined)
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result).toBeNull()
  })

  it('returns property with null latestValuation and null yield when no valuations', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue(undefined)
    mocks.mockFindTrailing12m.mockResolvedValue([])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result).not.toBeNull()
    expect(result?.property).toEqual(prop)
    expect(result?.latestValuation).toBeNull()
    expect(result?.yield).toBeNull()
  })

  it('computes gross yield: trailing12mRent / valueCents * 100', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 100000000, valuedAt: '2026-01-01', source: null,
    })
    mocks.mockFindTrailing12m.mockResolvedValue([
      { category: 'rent', amountCents: 5000000 },
      { category: 'insurance', amountCents: 200000 },
      { category: 'loan_payment', amountCents: 1000000 },
    ])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    // gross = 5000000 / 100000000 * 100 = 5.00
    expect(result?.yield?.grossPercent).toBe(5)
  })

  it('computes net yield excluding loan_payment: (rent - expenses) / valueCents * 100', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 100000000, valuedAt: '2026-01-01', source: null,
    })
    mocks.mockFindTrailing12m.mockResolvedValue([
      { category: 'rent', amountCents: 5000000 },
      { category: 'insurance', amountCents: 200000 },
      { category: 'loan_payment', amountCents: 1000000 },
    ])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    // net = (5000000 - 200000) / 100000000 * 100 = 4.80
    expect(result?.yield?.netPercent).toBe(4.8)
    expect(result?.yield?.periodLabel).toBe('trailing 12m')
  })

  it('returns latestValuation fields on the result', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 65000000, valuedAt: '2026-03-01', source: 'bank',
    })
    mocks.mockFindTrailing12m.mockResolvedValue([])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result?.latestValuation?.valueCents).toBe(65000000)
    expect(result?.latestValuation?.valuedAt).toBe('2026-03-01')
    expect(result?.latestValuation?.source).toBe('bank')
  })

  it('returns totalDebtCents=0 and null equity/lvr when no loans', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 80000000, valuedAt: '2026-01-01', source: null,
    })
    mocks.mockFindTrailing12m.mockResolvedValue([])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result?.totalDebtCents).toBe(0)
    expect(result?.equityCents).toBe(80000000)
    expect(result?.lvrDecimal).toBeNull()
  })

  it('computes equity, LVR and totalDebtCents when loans have balances', async () => {
    const loanId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 100000000, valuedAt: '2026-01-01', source: null,
    })
    mocks.mockFindTrailing12m.mockResolvedValue([])
    mocks.mockFindLoanIdsByProperty.mockResolvedValue([loanId])
    mocks.mockFindLatestBalancesByLoanIds.mockResolvedValue([
      { installmentLoanId: loanId, balanceCents: 50000000 },
    ])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result?.totalDebtCents).toBe(50000000)
    expect(result?.equityCents).toBe(50000000)
    expect(result?.lvrDecimal).toBeCloseTo(0.5)
  })

  it('verifies findLoanIdsByProperty is called with the correct userId and propertyId', async () => {
    mocks.mockFindById.mockResolvedValue(prop)
    mocks.mockFindLatestValuation.mockResolvedValue(null)
    mocks.mockFindTrailing12m.mockResolvedValue([])
    await getPropertyWithStats(USER_ID, PROP_ID)
    expect(mocks.mockFindLoanIdsByProperty).toHaveBeenCalledWith(USER_ID, PROP_ID)
  })

  it('computes totalAppreciationCents when purchasePriceCents is set', async () => {
    mocks.mockFindById.mockResolvedValue({ ...prop, purchasePriceCents: 60000000 })
    mocks.mockFindLatestValuation.mockResolvedValue({
      id: 'v1', valueCents: 80000000, valuedAt: '2026-01-01', source: null,
    })
    mocks.mockFindTrailing12m.mockResolvedValue([])
    const result = await getPropertyWithStats(USER_ID, PROP_ID)
    expect(result?.totalAppreciationCents).toBe(20000000)
  })
})
