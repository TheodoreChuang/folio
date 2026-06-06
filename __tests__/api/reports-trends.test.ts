import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reports/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchTrendData: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/aggregate', () => ({
  fetchTrendData: mocks.mockFetchTrendData,
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/reports/trends')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

// A DB row as returned from fetchTrendData
function makeRow(month: string, category: string, totalCents: number) {
  return { month, category, totalCents }
}

describe('GET /api/reports/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFetchTrendData.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ from: '2025-04-01', to: '2026-03-31' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when from is missing', async () => {
    const res = await GET(makeRequest({ to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from/i)
  })

  it('returns 400 when to is missing', async () => {
    const res = await GET(makeRequest({ from: '2025-04-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/to/i)
  })

  it('returns 400 when from is not a valid date', async () => {
    const res = await GET(makeRequest({ from: 'not-a-date', to: '2026-03-31' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when from > to', async () => {
    const res = await GET(makeRequest({ from: '2026-03-31', to: '2025-04-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from/i)
  })

  it('returns 400 when range exceeds 24 months', async () => {
    const res = await GET(makeRequest({ from: '2024-01-01', to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/24 months/i)
  })

  it('returns 400 for invalid entityId', async () => {
    const res = await GET(makeRequest({ from: '2025-04-01', to: '2026-03-31', entityId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/entityId/i)
  })

  it('returns 12 data points for a 12-month range', async () => {
    const res = await GET(makeRequest({ from: '2025-04-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(12)
  })

  it('returns 6 data points for a 6-month range', async () => {
    const res = await GET(makeRequest({ from: '2025-10-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(6)
    const months = json.trends.map((t: { month: string }) => t.month)
    expect(months[0]).toBe('2025-10')
    expect(months[5]).toBe('2026-03')
  })

  it('returns FY data points for AU FY range', async () => {
    const res = await GET(makeRequest({ from: '2025-07-01', to: '2026-06-30' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(12)
    expect(json.trends[0].month).toBe('2025-07')
    expect(json.trends[11].month).toBe('2026-06')
  })

  it('zero fields for months with no entries (not null)', async () => {
    mocks.mockFetchTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31' }))
    const json = await res.json()
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    expect(jan.rentCents).toBe(0)
    expect(jan.netCents).toBe(0)
  })

  it('hasData is false for months with no entries', async () => {
    const res = await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31' }))
    const json = await res.json()
    json.trends.forEach((t: { hasData: boolean }) => {
      expect(t.hasData).toBe(false)
    })
  })

  it('hasData is true for months with any entries', async () => {
    mocks.mockFetchTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.trends[0].hasData).toBe(true)
  })

  it('derives netCents from rent - expenses - mortgage', async () => {
    mocks.mockFetchTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
      makeRow('2026-03', 'repairs', 90000),
      makeRow('2026-03', 'loan_payment', 210000),
    ])
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    const point = json.trends[0]
    expect(point.rentCents).toBe(400000)
    expect(point.expensesCents).toBe(90000)
    expect(point.mortgageCents).toBe(210000)
    expect(point.netCents).toBe(400000 - 90000 - 210000)
  })

  it('aggregates multiple expense categories into expensesCents', async () => {
    mocks.mockFetchTrendData.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
      makeRow('2026-03', 'insurance', 10000),
      makeRow('2026-03', 'rates', 5000),
      makeRow('2026-03', 'repairs', 20000),
    ])
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.trends[0].expensesCents).toBe(35000)
  })

  it('multiple months populate their respective months correctly', async () => {
    mocks.mockFetchTrendData.mockResolvedValueOnce([
      makeRow('2026-01', 'rent', 300000),
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31' }))
    const json = await res.json()
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    const feb = json.trends.find((t: { month: string }) => t.month === '2026-02')
    const mar = json.trends.find((t: { month: string }) => t.month === '2026-03')
    expect(jan.rentCents).toBe(300000)
    expect(feb.rentCents).toBe(0)
    expect(mar.rentCents).toBe(400000)
  })

  it('passes userId, from, to, and entityId to fetchTrendData', async () => {
    const ENTITY_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'
    await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31', entityId: ENTITY_ID }))
    expect(mocks.mockFetchTrendData).toHaveBeenCalledWith(
      'user-123',
      '2026-01-01',
      '2026-03-31',
      ENTITY_ID,
    )
  })

  it('passes null entityId when not provided', async () => {
    await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31' }))
    expect(mocks.mockFetchTrendData).toHaveBeenCalledWith(
      'user-123',
      '2026-01-01',
      '2026-03-31',
      null,
    )
  })
})
