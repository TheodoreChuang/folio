import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/properties/[id]/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindPropertyById: vi.fn(),
  mockFetchPropertyTrendData: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/property', () => ({
  findPropertyById: mocks.mockFindPropertyById,
}))

vi.mock('@/lib/reporting', () => ({
  fetchPropertyTrendData: mocks.mockFetchPropertyTrendData,
}))

function makeRequest(id: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/properties/${id}/trends`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRow(month: string, category: string, totalCents: number) {
  return { month, category, totalCents }
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
    mocks.mockFetchPropertyTrendData.mockResolvedValue([])
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

  it('returns 200 with trends array of correct length for valid request', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: '6' }), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(6)
  })

  it('defaults to 12 months when param is absent', async () => {
    const res = await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(12)
  })

  it('months with no data return hasData false and zero amounts', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    json.trends.forEach((t: { hasData: boolean; rentCents: number; netCents: number }) => {
      expect(t.hasData).toBe(false)
      expect(t.rentCents).toBe(0)
      expect(t.netCents).toBe(0)
    })
  })

  it('passes userId, propertyId, and date range to fetchPropertyTrendData', async () => {
    await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    // months=3 ending 2026-03: range is 2026-01 to 2026-03-31
    expect(mocks.mockFetchPropertyTrendData).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      '2026-01-01',
      '2026-03-31',
    )
  })

  it('returns months in ascending order ending at current month', async () => {
    const res = await GET(makeRequest(PROP_ID, { months: '3' }), makeParams(PROP_ID))
    const json = await res.json()
    const months = json.trends.map((t: { month: string }) => t.month)
    expect(months[0]).toBe('2026-01')
    expect(months[2]).toBe('2026-03')
  })

  it('derives netCents from rent - expenses - mortgage', async () => {
    mocks.mockFetchPropertyTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
      makeRow('2026-03', 'repairs', 90000),
      makeRow('2026-03', 'loan_payment', 210000),
    ])
    const res = await GET(makeRequest(PROP_ID, { months: '1' }), makeParams(PROP_ID))
    const json = await res.json()
    const point = json.trends[0]
    expect(point.rentCents).toBe(400000)
    expect(point.expensesCents).toBe(90000)
    expect(point.mortgageCents).toBe(210000)
    expect(point.netCents).toBe(400000 - 90000 - 210000)
    expect(point.hasData).toBe(true)
  })

  it('aggregates multiple expense categories into expensesCents', async () => {
    mocks.mockFetchPropertyTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'insurance', 10000),
      makeRow('2026-03', 'rates', 5000),
      makeRow('2026-03', 'repairs', 20000),
    ])
    const res = await GET(makeRequest(PROP_ID, { months: '1' }), makeParams(PROP_ID))
    const json = await res.json()
    expect(json.trends[0].expensesCents).toBe(35000)
  })

  it('passes userId to findPropertyById for ownership check', async () => {
    await GET(makeRequest(PROP_ID), makeParams(PROP_ID))
    expect(mocks.mockFindPropertyById).toHaveBeenCalledWith('user-123', PROP_ID)
  })
})
