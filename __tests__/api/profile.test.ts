import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = 'user-0001-0000-4000-a000-000000000001'

const profileRow = {
  id: 'prof-0001-0000-4000-b000-000000000001',
  userId: USER_ID,
  investmentGoal: 'Build a 10-property portfolio',
  strategyNotes: 'Focus on high-yield regional markets',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetProfile: vi.fn(),
  mockUpsertProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/profile', () => ({
  getProfile: mocks.mockGetProfile,
  upsertProfile: mocks.mockUpsertProfile,
}))

function makeRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/profile', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when no profile exists', async () => {
    mocks.mockGetProfile.mockResolvedValue(null)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(404)
    expect(mocks.mockGetProfile).toHaveBeenCalledWith(USER_ID)
  })

  it('returns { profile: { investmentGoal, strategyNotes } } when profile exists', async () => {
    mocks.mockGetProfile.mockResolvedValue(profileRow)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({
      investmentGoal: 'Build a 10-property portfolio',
      strategyNotes: 'Focus on high-yield regional markets',
    })
    expect(mocks.mockGetProfile).toHaveBeenCalledWith(USER_ID)
  })
})

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.mockUpsertProfile.mockResolvedValue(profileRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/profile/route')
    const res = await PATCH(makeRequest('PATCH', { investmentGoal: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when investmentGoal exceeds 200 chars', async () => {
    const { PATCH } = await import('@/app/api/profile/route')
    const res = await PATCH(makeRequest('PATCH', { investmentGoal: 'a'.repeat(201) }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toBeDefined()
  })

  it('returns 400 when strategyNotes exceeds 500 chars', async () => {
    const { PATCH } = await import('@/app/api/profile/route')
    const res = await PATCH(makeRequest('PATCH', { strategyNotes: 'b'.repeat(501) }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toBeDefined()
  })

  it('returns 200 with empty object body (both fields omitted)', async () => {
    const { PATCH } = await import('@/app/api/profile/route')
    const res = await PATCH(makeRequest('PATCH', {}))
    expect(res.status).toBe(200)
    expect(mocks.mockUpsertProfile).toHaveBeenCalledWith(USER_ID, {})
  })

  it('calls upsertProfile with userId from session', async () => {
    const { PATCH } = await import('@/app/api/profile/route')
    const res = await PATCH(makeRequest('PATCH', { investmentGoal: 'FIRE by 50' }))
    expect(res.status).toBe(200)
    expect(mocks.mockUpsertProfile).toHaveBeenCalledWith(USER_ID, { investmentGoal: 'FIRE by 50' })
    const body = await res.json()
    expect(body.profile).toBeDefined()
  })
})
