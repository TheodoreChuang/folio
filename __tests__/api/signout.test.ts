import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/v1/auth/signout/route'

const mocks = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
  mockFindApiKeyByHash: vi.fn(),
  mockTouchLastUsed: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { signOut: mocks.mockSignOut, getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/api-keys', () => ({
  findApiKeyByHash: mocks.mockFindApiKeyByHash,
  touchLastUsed: mocks.mockTouchLastUsed,
}))

describe('POST /api/v1/auth/signout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSignOut.mockResolvedValue({})
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockTouchLastUsed.mockResolvedValue(undefined)
  })

  function makeRequest(bearerToken?: string) {
    return new Request('http://localhost/api/v1/auth/signout', {
      method: 'POST',
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    })
  }

  it('signs out and returns { success: true } for cookie auth', async () => {
    const res = await POST(makeRequest())
    expect(mocks.mockSignOut).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })

  it('returns 400 for bearer token auth with helpful message', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue({ id: 'key-1', userId: 'user-123' })
    const res = await POST(makeRequest('sk_live_testtoken123456'))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/DELETE/)
    expect(mocks.mockSignOut).not.toHaveBeenCalled()
  })

  it('still returns { success: true } when not authenticated (signout is idempotent)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mocks.mockSignOut).toHaveBeenCalledOnce()
  })
})
