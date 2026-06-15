import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/v1/ledger/summary/route'

const PROP_ID  = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID  = 'bbbb0001-0000-4000-b000-000000000001'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetCashflow: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/aggregate', () => ({
  getCashflowSummary: mocks.mockGetCashflow,
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/ledger/summary')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

function zeroTotals() {
  return {
    totalRent: 0, totalOtherIncome: 0, totalExpenses: 0, totalMortgage: 0,
    netBeforeMortgage: 0, netAfterMortgage: 0,
    statementsReceived: 0, mortgagesProvided: 0,
    propertyCount: 0, properties: [],
  }
}

function zeroFlags() {
  return { missingStatements: [], missingMortgages: [] }
}

describe('GET /api/ledger/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockGetCashflow.mockResolvedValue({ totals: zeroTotals(), flags: zeroFlags() })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when from is missing', async () => {
    const res = await GET(makeRequest({ to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from/i)
  })

  it('returns 400 when to is missing', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid from date format', async () => {
    const res = await GET(makeRequest({ from: '2026-03', to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/YYYY-MM-DD/i)
  })

  it('returns 400 for invalid to date format', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01', to: 'march' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when from > to', async () => {
    const res = await GET(makeRequest({ from: '2026-03-31', to: '2026-03-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from.*to|before/i)
  })

  it('returns zero totals when no entries in range', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.totalRent).toBe(0)
    expect(json.totals.totalExpenses).toBe(0)
    expect(json.totals.totalMortgage).toBe(0)
    expect(json.totals.netAfterMortgage).toBe(0)
  })

  it('returns correct totals for entries in range', async () => {
    mocks.mockGetCashflow.mockResolvedValueOnce({
      totals: {
        ...zeroTotals(),
        totalRent: 400000, totalExpenses: 50000, totalMortgage: 200000,
        netBeforeMortgage: 350000, netAfterMortgage: 150000,
        propertyCount: 1,
        properties: [{ propertyId: PROP_ID, address: '123 Smith St', nickname: null, rentCents: 400000, otherIncomeCents: 0, expensesCents: 50000, mortgageCents: 200000, netCents: 150000, hasStatement: true, hasMortgage: true }],
      },
      flags: { missingStatements: [], missingMortgages: [] },
    })

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.totalRent).toBe(400000)
    expect(json.totals.totalExpenses).toBe(50000)
    expect(json.totals.totalMortgage).toBe(200000)
    expect(json.totals.netAfterMortgage).toBe(150000)
  })

  it('includes other_income in totals and per-property breakdown', async () => {
    mocks.mockGetCashflow.mockResolvedValueOnce({
      totals: {
        ...zeroTotals(),
        totalRent: 400000, totalOtherIncome: 26520, totalExpenses: 50000,
        netBeforeMortgage: 376520, netAfterMortgage: 376520,
        propertyCount: 1,
        properties: [{ propertyId: PROP_ID, address: '123 Smith St', nickname: null, rentCents: 400000, otherIncomeCents: 26520, expensesCents: 50000, mortgageCents: 0, netCents: 376520, hasStatement: true, hasMortgage: false }],
      },
      flags: zeroFlags(),
    })

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.totalOtherIncome).toBe(26520)
    expect(json.totals.netBeforeMortgage).toBe(376520)
    expect(json.totals.properties[0].otherIncomeCents).toBe(26520)
  })

  it('returns per-property breakdown in totals.properties', async () => {
    mocks.mockGetCashflow.mockResolvedValueOnce({
      totals: {
        ...zeroTotals(),
        totalRent: 400000, propertyCount: 1,
        properties: [{ propertyId: PROP_ID, address: '123 Smith St', nickname: null, rentCents: 400000, otherIncomeCents: 0, expensesCents: 0, mortgageCents: 0, netCents: 400000, hasStatement: true, hasMortgage: false }],
      },
      flags: zeroFlags(),
    })

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.totals.properties).toHaveLength(1)
    expect(json.totals.properties[0].propertyId).toBe(PROP_ID)
    expect(json.totals.properties[0].rentCents).toBe(400000)
  })

  it('includes flags in response', async () => {
    mocks.mockGetCashflow.mockResolvedValueOnce({
      totals: zeroTotals(),
      flags: { missingStatements: [PROP_ID], missingMortgages: [] },
    })

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.flags).toBeDefined()
    expect(Array.isArray(json.flags.missingMortgages)).toBe(true)
  })

  it('propertyId param is forwarded to getCashflowSummary', async () => {
    mocks.mockGetCashflow.mockResolvedValueOnce({
      totals: { ...zeroTotals(), propertyCount: 1, properties: [{ propertyId: PROP_ID, address: '123 Smith St', nickname: null, rentCents: 0, otherIncomeCents: 0, expensesCents: 0, mortgageCents: 0, netCents: 0, hasStatement: false, hasMortgage: false }] },
      flags: zeroFlags(),
    })

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31', propertyId: PROP_ID }))
    expect(res.status).toBe(200)
    expect(mocks.mockGetCashflow).toHaveBeenCalledWith(
      'user-123', '2026-03-01', '2026-03-31', { propertyId: PROP_ID, entityId: undefined },
    )
  })

  it('returns propertyCount: 0 when no properties exist', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.totals.propertyCount).toBe(0)
  })

  it('passes userId to getCashflowSummary', async () => {
    await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(mocks.mockGetCashflow).toHaveBeenCalledWith(
      'user-123', '2026-03-01', '2026-03-31', { propertyId: undefined, entityId: undefined },
    )
  })
})
