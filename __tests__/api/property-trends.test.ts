import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/properties/[id]/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindPropertyById: vi.fn(),
  mockListPropertyTrends: vi.fn(),
  mockComputeTrends: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/property', () => ({
  findPropertyById: mocks.mockFindPropertyById,
}))

vi.mock('@/lib/aggregate', () => ({
  listPropertyTrends: mocks.mockListPropertyTrends,
  computeTrends: mocks.mockComputeTrends,
}))

function makeRequest(id: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/properties/${id}/trends`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const propRow = {
  id: PROP_ID,
  userId: 'user-123',
  address: '42 Wallaby Way, Sydney NSW 2000',
  nickname: null,
  createdAt: new Date(),
}

describe('GET /api/properties/[id]/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindPropertyById.mockResolvedValue(propRow)
    mocks.mockListPropertyTrends.mockResolvedValue([])
    mocks.mockComputeTrends.mockReturnValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid UUID property ID', async () => {
    const res = await GET(makeRequest('not-a-uuid'), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property id/i)
  })

  it('returns 400 for months=0', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: '0' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/months/i)
  })

  it('returns 400 for months=25', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: '25' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/months/i)
  })

  it('returns 400 for non-numeric months', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: 'abc' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when property not found for this user', async () => {
    mocks.mockFindPropertyById.mockResolvedValue(undefined)
    const res = await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns 200 with trends from computeTrends and avgMonthlyNetCents', async () => {
    const fakeTrends = [{ month: '2026-03', rentCents: 0, expensesCents: 0, mortgageCents: 0, netCents: 0, hasData: false }]
    mocks.mockComputeTrends.mockReturnValueOnce(fakeTrends)
    const res = await GET(makeRequest(PROP_ID, { months: '1' }), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toEqual(fakeTrends)
    expect(json.avgMonthlyNetCents).toBeNull()
  })

  it('defaults to 12 months when param is absent', async () => {
    await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    const months = mocks.mockComputeTrends.mock.calls[0][1] as string[]
    expect(months).toHaveLength(12)
  })

  it('passes userId, propertyId, and date range to listPropertyTrends', async () => {
    await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    // months=3 ending 2026-03: range is 2026-01 to 2026-03-31
    expect(mocks.mockListPropertyTrends).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      '2026-01-01',
      '2026-03-31',
    )
  })

  it('calls computeTrends with months in ascending order ending at current month', async () => {
    await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    const months = mocks.mockComputeTrends.mock.calls[0][1] as string[]
    expect(months[0]).toBe('2026-01')
    expect(months[2]).toBe('2026-03')
  })

  it('computes avgMonthlyNetCents from active months', async () => {
    mocks.mockComputeTrends.mockReturnValueOnce([
      { month: '2026-01', rentCents: 100, expensesCents: 0, mortgageCents: 0, netCents: 100, hasData: true },
      { month: '2026-02', rentCents: 0,   expensesCents: 0, mortgageCents: 0, netCents: 0,   hasData: false },
      { month: '2026-03', rentCents: 200, expensesCents: 0, mortgageCents: 0, netCents: 200, hasData: true },
    ])
    const res = await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    const json = await res.json()
    // Active months: Jan (100) + Mar (200) → avg = 150
    expect(json.avgMonthlyNetCents).toBe(150)
  })

  it('returns null avgMonthlyNetCents when no months have data', async () => {
    mocks.mockComputeTrends.mockReturnValueOnce([
      { month: '2026-03', rentCents: 0, expensesCents: 0, mortgageCents: 0, netCents: 0, hasData: false },
    ])
    const res = await GET(makeRequest(PROP_ID, { months: '1' }), makeParams(PROP_ID))
    const json = await res.json()
    expect(json.avgMonthlyNetCents).toBeNull()
  })

  it('passes userId to findPropertyById for ownership check', async () => {
    await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    expect(mocks.mockFindPropertyById).toHaveBeenCalledWith('user-123', PROP_ID)
  })
})
