import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/portfolio/return/route'

const mocks = vi.hoisted(() => ({
  mockGetUser:         vi.fn(),
  mockFetchReturnData: vi.fn(),
  mockComputeReturn:   vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/aggregate', () => ({
  fetchReturnData: mocks.mockFetchReturnData,
  computeReturn:   mocks.mockComputeReturn,
}))

const MOCK_RETURN = {
  grossYieldPct:       4.44,
  capitalGrowthPct:    5.83,
  capitalGrowthCents:  11_400_000,
  totalReturnPct:      10.27,
  annualisedRentCents: 9_190_800,
  currentValueCents:   207_000_000,
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/portfolio/return')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

describe('GET /api/portfolio/return', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFetchReturnData.mockResolvedValue({
      endValuations:   [{ valueCents: 207_000_000 }],
      startValuations: [{ valueCents: 195_600_000 }],
      periodRentCents: 9_190_800,
    })
    mocks.mockComputeReturn.mockReturnValue(MOCK_RETURN)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when from is missing', async () => {
    const res = await GET(makeRequest({ to: '2026-06-30' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from/i)
  })

  it('returns 400 when from is not a valid date string', async () => {
    const res = await GET(makeRequest({ from: '2026-13-01', to: '2026-12-31' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when to is missing', async () => {
    const res = await GET(makeRequest({ from: '2025-06-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/to/i)
  })

  it('returns 400 when from > to', async () => {
    const res = await GET(makeRequest({ from: '2026-06-30', to: '2025-06-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from.*after|after.*to/i)
  })

  it('returns 400 when entityId is present but not a valid UUID', async () => {
    const res = await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30', entityId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/entityId.*UUID|UUID.*entityId/i)
  })

  it('returns 200 with return metrics on valid request', async () => {
    const res = await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.return).toMatchObject({
      grossYieldPct:       4.44,
      capitalGrowthPct:    5.83,
      capitalGrowthCents:  11_400_000,
      totalReturnPct:      10.27,
      annualisedRentCents: 9_190_800,
      currentValueCents:   207_000_000,
    })
  })

  it('passes entityId to fetchReturnData when provided', async () => {
    const entityId = 'aaaaaaaa-0000-4000-a000-000000000001'
    await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30', entityId }))
    expect(mocks.mockFetchReturnData).toHaveBeenCalledWith(
      'user-123', '2025-06-01', '2026-06-30', entityId
    )
  })

  it('passes null entityId to fetchReturnData when not provided', async () => {
    await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30' }))
    expect(mocks.mockFetchReturnData).toHaveBeenCalledWith(
      'user-123', '2025-06-01', '2026-06-30', null
    )
  })

  it('passes correct periodMonths to computeReturn (13 months for 2025-06-01 to 2026-06-30)', async () => {
    await GET(makeRequest({ from: '2025-06-01', to: '2026-06-30' }))
    expect(mocks.mockComputeReturn).toHaveBeenCalledWith(
      expect.objectContaining({ periodMonths: 13 })
    )
  })

  it('passes correct periodMonths to computeReturn (1 month for single-month range)', async () => {
    await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(mocks.mockComputeReturn).toHaveBeenCalledWith(
      expect.objectContaining({ periodMonths: 1 })
    )
  })
})
