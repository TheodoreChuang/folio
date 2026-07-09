import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/auth/callback/route'

const mocks = vi.hoisted(() => ({
  mockExchangeCode: vi.fn(),
  mockGetUser: vi.fn(),
  mockEntityCheck: vi.fn(),
  mockInsertValues: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mocks.mockExchangeCode,
        getUser: mocks.mockGetUser,
      },
    })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mocks.mockEntityCheck,
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: mocks.mockInsertValues,
    }),
  },
}))

function makeRequest(code?: string) {
  const url = code
    ? `http://localhost:3000/auth/callback?code=${code}`
    : 'http://localhost:3000/auth/callback'
  return new Request(url)
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExchangeCode.mockResolvedValue({})
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockEntityCheck.mockResolvedValue([{ id: 'entity-1' }]) // entity exists → no insert
    mocks.mockInsertValues.mockResolvedValue([{ id: 'entity-1' }])
  })

  it('redirects to /dashboard after a successful code exchange', async () => {
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
  })

  it('creates individual entity when none exists', async () => {
    mocks.mockEntityCheck.mockResolvedValue([]) // no existing entity
    await GET(makeRequest('valid-code'))
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'individual', name: 'Personal', userId: 'user-123' })
    )
  })

  it('does not create entity when one already exists', async () => {
    mocks.mockEntityCheck.mockResolvedValue([{ id: 'entity-1' }]) // entity exists
    await GET(makeRequest('valid-code'))
    expect(mocks.mockInsertValues).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard when no code param is present', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
    expect(mocks.mockExchangeCode).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard when getUser returns null after code exchange', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
  })
})
