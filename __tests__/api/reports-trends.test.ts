import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/v1/reports/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListTrends: vi.fn(),
  mockComputeTrends: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/aggregate', () => ({
  listTrends: mocks.mockListTrends,
  computeTrends: mocks.mockComputeTrends,
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/reports/trends')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

describe('GET /api/reports/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListTrends.mockResolvedValue([])
    mocks.mockComputeTrends.mockReturnValue([])
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

  it('calls computeTrends with rows and a 12-month range', async () => {
    await GET(makeRequest({ from: '2025-04-01', to: '2026-03-31' }))
    expect(mocks.mockComputeTrends).toHaveBeenCalledWith(
      [],
      expect.arrayContaining([expect.stringMatching(/^\d{4}-\d{2}$/)]),
    )
    expect(mocks.mockComputeTrends.mock.calls[0][1]).toHaveLength(12)
  })

  it('calls computeTrends with a 6-month range starting at the right month', async () => {
    await GET(makeRequest({ from: '2025-10-01', to: '2026-03-31' }))
    const months = mocks.mockComputeTrends.mock.calls[0][1] as string[]
    expect(months).toHaveLength(6)
    expect(months[0]).toBe('2025-10')
    expect(months[5]).toBe('2026-03')
  })

  it('calls computeTrends with AU FY range', async () => {
    await GET(makeRequest({ from: '2025-07-01', to: '2026-06-30' }))
    const months = mocks.mockComputeTrends.mock.calls[0][1] as string[]
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2025-07')
    expect(months[11]).toBe('2026-06')
  })

  it('returns the computeTrends result wrapped in { trends }', async () => {
    const fakeTrends = [{ month: '2026-03', rentCents: 0, expensesCents: 0, mortgageCents: 0, netCents: 0, hasData: false }]
    mocks.mockComputeTrends.mockReturnValueOnce(fakeTrends)
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toEqual(fakeTrends)
  })

  it('passes userId, from, to, and entityId to listTrends', async () => {
    const ENTITY_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'
    await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31', entityId: ENTITY_ID }))
    expect(mocks.mockListTrends).toHaveBeenCalledWith(
      'user-123',
      '2026-01-01',
      '2026-03-31',
      ENTITY_ID,
    )
  })

  it('passes null entityId when not provided', async () => {
    await GET(makeRequest({ from: '2026-01-01', to: '2026-03-31' }))
    expect(mocks.mockListTrends).toHaveBeenCalledWith(
      'user-123',
      '2026-01-01',
      '2026-03-31',
      null,
    )
  })
})
